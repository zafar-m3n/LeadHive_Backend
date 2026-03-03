// controllers/reportsController.js
const { Op, fn, col, literal } = require("sequelize");
const {
  Lead,
  LeadStatus,
  LeadSource,
  LeadNote,
  LeadAssignment,
  User,
  Role,
  Team,
  TeamMember,
  TeamManager,
} = require("../models");
const { resSuccess, resError } = require("../utils/responseUtil");

// Subquery: latest assignment row id per lead
const LATEST_ASSIGNMENT_IDS = literal(`(SELECT MAX(id) FROM lead_assignments GROUP BY lead_id)`);

// =============================
// Helpers
// =============================

/**
 * Parse the requested month/year from query string.
 * Accepted format:
 *   ?year=2026&month=3
 * If missing, defaults to *current* month (UTC).
 *
 * Restricts year to [2025, 2035] and month to [1..12].
 */
function parseMonthRange(req) {
  let year = parseInt(req.query.year, 10);
  let month = parseInt(req.query.month, 10); // 1..12

  const now = new Date();

  if (!year || Number.isNaN(year)) {
    year = now.getUTCFullYear();
  }
  if (!month || Number.isNaN(month)) {
    month = now.getUTCMonth() + 1;
  }

  if (year < 2025 || year > 2035) {
    throw new Error("Year must be between 2025 and 2035");
  }
  if (month < 1 || month > 12) {
    throw new Error("Month must be between 1 and 12");
  }

  // Start of month (UTC)
  const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
  // End of month (UTC) – day 0 of next month gives the last day of this month
  const end = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));

  return { year, month, start, end };
}

/**
 * For a manager, resolve the "team scope":
 *  - self (manager)
 *  - all members of teams they manage
 *
 * Returns array of user_ids (unique).
 */
const resolveManagerAssignees = async (managerId) => {
  const tmRows = await TeamManager.findAll({
    where: { manager_id: managerId },
    attributes: ["team_id"],
    raw: true,
  });

  const teamIds = tmRows.map((r) => r.team_id);
  if (!teamIds.length) return [managerId];

  const memberRows = await TeamMember.findAll({
    where: { team_id: { [Op.in]: teamIds } },
    attributes: ["user_id"],
    raw: true,
  });

  const memberIds = memberRows.map((r) => r.user_id);

  return Array.from(new Set([managerId, ...memberIds]));
};

// =============================
// Controller: Monthly Reports
// =============================

/**
 * GET /api/v1/reports/monthly?year=2026&month=3
 *
 * Returns a single JSON payload for the Reports page, covering ONE month:
 *  - Call Statistics card (total + per-agent breakdown)
 *  - Calls by Source card
 *  - Sales from Calls card
 *  - Monthly Performance table
 *
 * Role scoping:
 *  - admin     -> all sales reps
 *  - manager   -> sales reps in teams they manage (and within those teams)
 *  - sales_rep -> self only
 */
const getMonthlyReports = async (req, res) => {
  try {
    const { id: userId, role } = req.user;

    // 1) Month range (2025–2035; defaults to current month)
    let range;
    try {
      range = parseMonthRange(req);
    } catch (err) {
      return resError(res, err.message, 400);
    }
    const { year, month, start, end } = range;

    // 2) Determine role-based scope for "agents"
    //    - admin   -> all sales reps (no further restriction)
    //    - manager -> sales reps in teams they manage
    //    - sales_rep -> self
    let scopeType = "all";
    let scopedUserIds = null; // used for role scoping of notes & sales

    if (role === "admin") {
      scopeType = "all";
      scopedUserIds = null;
    } else if (role === "manager") {
      scopeType = "team";
      scopedUserIds = await resolveManagerAssignees(userId); // manager + members
    } else if (role === "sales_rep") {
      scopeType = "self";
      scopedUserIds = [userId];
    } else {
      return resError(res, "Forbidden for this role", 403);
    }

    // 3) Load master lists: statuses & sources (for sales + performance table)
    const allStatuses = await LeadStatus.findAll({
      attributes: ["id", "value", "label"],
      order: [["id", "ASC"]],
    });

    const allSources = await LeadSource.findAll({
      attributes: ["id", "value", "label"],
      order: [["id", "ASC"]],
    });

    // Find customer status (for sales)
    const customerStatus = allStatuses.find((s) => {
      const v = (s.value || "").toLowerCase();
      const l = (s.label || "").toLowerCase();
      return v === "customer" || l === "customer";
    });

    // 4) Find "agents" (sales reps) in scope
    const agentWhere = { is_active: true };
    if (scopeType === "self") {
      agentWhere.id = userId;
    } else if (scopeType === "team" && Array.isArray(scopedUserIds) && scopedUserIds.length) {
      agentWhere.id = { [Op.in]: scopedUserIds };
    }

    const agentUsers = await User.findAll({
      where: agentWhere,
      include: [
        {
          model: Role,
          attributes: [],
          where: { value: "sales_rep" },
        },
      ],
      attributes: ["id", "full_name", "email"],
      order: [["full_name", "ASC"]],
    });

    const agentIds = agentUsers.map((u) => u.id);

    // Common WHERE for LeadNote-based queries (calls for this month)
    const notesWhere = {
      created_at: {
        [Op.gte]: start,
        [Op.lte]: end,
      },
    };

    if (agentIds.length) {
      notesWhere.author_id = { [Op.in]: agentIds };
    } else if (scopeType !== "all") {
      // No agents but scoped role -> force zero rows
      notesWhere.author_id = { [Op.in]: [-1] };
    }

    // =========================
    // 6) Call Statistics card
    // =========================
    let callStatistics = {
      totalCalls: 0,
      byAgent: [],
    };

    let callCountsMap = new Map();

    if (agentIds.length) {
      const callStatsRows = await LeadNote.findAll({
        where: notesWhere,
        attributes: ["author_id", [fn("COUNT", col("LeadNote.id")), "call_count"]],
        group: ["author_id"],
        raw: true,
      });

      callCountsMap = new Map(callStatsRows.map((r) => [Number(r.author_id), Number(r.call_count || 0)]));

      const byAgent = agentUsers.map((user) => {
        const callCount = callCountsMap.get(user.id) || 0;
        return {
          user_id: user.id,
          full_name: user.full_name,
          email: user.email,
          call_count: callCount,
        };
      });

      const totalCalls = byAgent.reduce((sum, a) => sum + a.call_count, 0);

      callStatistics = {
        totalCalls,
        byAgent: byAgent.sort((a, b) => b.call_count - a.call_count || a.full_name.localeCompare(b.full_name)),
      };
    }

    // =========================
    // 7) Calls by Source card
    // =========================
    //
    // Now additionally constrained by the lead's *last contacted* date
    // (Lead.updated_at) being in [start, end].
    let callsBySource = [];

    if (agentIds.length) {
      const callsBySourceRows = await LeadNote.findAll({
        where: notesWhere,
        attributes: [
          [col("Lead.source_id"), "source_id"],
          [fn("COUNT", col("LeadNote.id")), "call_count"],
        ],
        include: [
          {
            model: Lead,
            attributes: [],
            where: {
              updated_at: {
                [Op.gte]: start,
                [Op.lte]: end,
              },
            },
            include: [
              {
                model: LeadSource,
                attributes: ["id", "label", "value"],
              },
            ],
          },
        ],
        group: ["Lead.source_id", "Lead->LeadSource.id", "Lead->LeadSource.label", "Lead->LeadSource.value"],
        raw: true,
      });

      callsBySource = callsBySourceRows.map((r) => ({
        source_id: r.source_id,
        label: r["Lead.LeadSource.label"] || null,
        value: r["Lead.LeadSource.value"] || null,
        call_count: Number(r.call_count || 0),
      }));
    }

    // =========================
    // 8) Sales from Calls card
    // =========================
    //
    // Now requires BOTH:
    //  - Lead.status = CUSTOMER AND Lead.updated_at in [start, end] (i.e., last contacted this month)
    //  - Lead has at least one LeadNote (call) this month by an in-scope agent.
    let salesFromCalls = {
      totalCustomers: 0,
      bySource: [],
    };

    const conversionsMap = new Map(); // user_id -> conversions_this_month

    // Precompute: which leads had calls this month (for "from calls" requirement)
    let leadIdsWithCallsThisMonth = new Set();
    if (agentIds.length) {
      const leadsWithCallsRows = await LeadNote.findAll({
        where: notesWhere,
        attributes: [[fn("DISTINCT", col("lead_id")), "lead_id"]],
        raw: true,
      });

      leadIdsWithCallsThisMonth = new Set(
        leadsWithCallsRows.map((r) => Number(r.lead_id)).filter((id) => !Number.isNaN(id)),
      );
    }

    if (customerStatus) {
      const salesWhere = {
        status_id: customerStatus.id,
        updated_at: {
          [Op.gte]: start,
          [Op.lte]: end,
        },
      };

      const assignmentWhere = {
        id: { [Op.in]: LATEST_ASSIGNMENT_IDS },
      };

      if (scopeType === "team" && scopedUserIds && scopedUserIds.length) {
        assignmentWhere.assignee_id = { [Op.in]: scopedUserIds };
      } else if (scopeType === "self") {
        assignmentWhere.assignee_id = userId;
      }

      const customerLeadsRaw = await Lead.findAll({
        where: salesWhere,
        attributes: ["id", "source_id"],
        include: [
          {
            model: LeadSource,
            attributes: ["id", "label", "value"],
          },
          {
            model: LeadAssignment,
            as: "LeadAssignments",
            attributes: ["assignee_id"],
            required: true,
            where: assignmentWhere,
          },
        ],
      });

      // Filter to only those leads that had at least one call (LeadNote) this month
      const customerLeads = customerLeadsRaw.filter((lead) => leadIdsWithCallsThisMonth.has(lead.id));

      const totalCustomers = customerLeads.length;

      // Group customers by source
      const bySourceMap = new Map();
      for (const lead of customerLeads) {
        const id = lead.source_id || 0;
        const key = String(id);
        const current = bySourceMap.get(key) || {
          source_id: id,
          label: lead.LeadSource ? lead.LeadSource.label : null,
          value: lead.LeadSource ? lead.LeadSource.value : null,
          count: 0,
        };
        current.count += 1;
        bySourceMap.set(key, current);

        // Attribute conversions to latest assignee (agent)
        const latestAssignment = Array.isArray(lead.LeadAssignments) ? lead.LeadAssignments[0] : null;
        const assigneeId = latestAssignment ? Number(latestAssignment.assignee_id) : null;

        if (assigneeId && agentIds.includes(assigneeId)) {
          const prev = conversionsMap.get(assigneeId) || 0;
          conversionsMap.set(assigneeId, prev + 1);
        }
      }

      const customersBySource = Array.from(bySourceMap.values()).sort((a, b) => b.count - a.count);

      salesFromCalls = {
        totalCustomers,
        bySource: customersBySource,
      };
    }

    // =========================
    // 9) Monthly Performance table
    // =========================
    //
    // Month-based:
    //  - status_counts: only leads whose LATEST assignment's assigned_at
    //    falls within [start, end].
    //  - source_counts: same, but grouped by Lead.source_id.
    //  - callsThisMonth: from LeadNote (already month-filtered above).
    //  - conversionsThisMonth: from salesFromCalls (already month-filtered).
    let monthlyPerformance = {
      statuses: allStatuses.map((s) => ({
        id: s.id,
        value: s.value,
        label: s.label,
      })),
      sources: allSources.map((src) => ({
        id: src.id,
        value: src.value,
        label: src.label,
      })),
      agents: [],
    };

    if (agentIds.length) {
      // 9.1 Status breakdown by agent (ONLY assignments in this month)
      const statusRows = await LeadAssignment.findAll({
        attributes: [
          "assignee_id",
          [col("Lead.status_id"), "status_id"],
          [fn("COUNT", col("LeadAssignment.lead_id")), "lead_count"],
        ],
        where: {
          id: { [Op.in]: LATEST_ASSIGNMENT_IDS },
          assignee_id: { [Op.in]: agentIds },
          assigned_at: {
            [Op.gte]: start,
            [Op.lte]: end,
          },
        },
        include: [
          {
            model: Lead,
            attributes: [],
          },
        ],
        group: ["assignee_id", "Lead.status_id"],
        raw: true,
      });

      const statusCountsByAgent = new Map(); // agentId -> Map(statusId -> count)
      for (const row of statusRows) {
        const aid = String(row.assignee_id);
        const sid = String(row.status_id || 0);
        const count = Number(row.lead_count || 0);

        if (!statusCountsByAgent.has(aid)) {
          statusCountsByAgent.set(aid, new Map());
        }
        const inner = statusCountsByAgent.get(aid);
        inner.set(sid, (inner.get(sid) || 0) + count);
      }

      // 9.2 Source breakdown by agent (ONLY assignments in this month)
      const sourceRows = await LeadAssignment.findAll({
        attributes: [
          "assignee_id",
          [col("Lead.source_id"), "source_id"],
          [fn("COUNT", col("LeadAssignment.lead_id")), "lead_count"],
        ],
        where: {
          id: { [Op.in]: LATEST_ASSIGNMENT_IDS },
          assignee_id: { [Op.in]: agentIds },
          assigned_at: {
            [Op.gte]: start,
            [Op.lte]: end,
          },
        },
        include: [
          {
            model: Lead,
            attributes: [],
          },
        ],
        group: ["assignee_id", "Lead.source_id"],
        raw: true,
      });

      const sourceCountsByAgent = new Map(); // agentId -> Map(sourceId -> count)
      for (const row of sourceRows) {
        const aid = String(row.assignee_id);
        const sid = String(row.source_id || 0);
        const count = Number(row.lead_count || 0);

        if (!sourceCountsByAgent.has(aid)) {
          sourceCountsByAgent.set(aid, new Map());
        }
        const inner = sourceCountsByAgent.get(aid);
        inner.set(sid, (inner.get(sid) || 0) + count);
      }

      // 9.3 Build final per-agent rows
      const agentsPerf = agentUsers.map((user) => {
        const aid = user.id;

        const statusMap = statusCountsByAgent.get(String(aid)) || new Map();
        const sourceMap = sourceCountsByAgent.get(String(aid)) || new Map();

        const statusCounts = allStatuses.map((s) => ({
          status_id: s.id,
          status_value: s.value,
          status_label: s.label,
          count: statusMap.get(String(s.id)) || 0,
        }));

        const sourceCounts = allSources.map((src) => ({
          source_id: src.id,
          source_value: src.value,
          source_label: src.label,
          count: sourceMap.get(String(src.id)) || 0,
        }));

        const callsThisMonth = callCountsMap.get(aid) || 0;
        const conversionsThisMonth = conversionsMap.get(aid) || 0;
        const conversionRate = callsThisMonth > 0 ? conversionsThisMonth / callsThisMonth : 0;

        return {
          user_id: aid,
          full_name: user.full_name,
          email: user.email,
          calls_this_month: callsThisMonth,
          conversion_rate: conversionRate,
          status_counts: statusCounts,
          source_counts: sourceCounts,
        };
      });

      monthlyPerformance = {
        statuses: monthlyPerformance.statuses,
        sources: monthlyPerformance.sources,
        agents: agentsPerf.sort(
          (a, b) => b.calls_this_month - a.calls_this_month || a.full_name.localeCompare(b.full_name),
        ),
      };
    }

    // =========================
    // 10) Final payload
    // =========================
    return resSuccess(res, {
      period: {
        year,
        month,
        start,
        end,
      },
      scope: {
        type: scopeType, // "all" | "team" | "self"
        user_id: userId,
      },
      cards: {
        callStatistics,
        callsBySource,
        salesFromCalls,
        monthlyPerformance,
      },
    });
  } catch (err) {
    console.error("getMonthlyReports Error:", err);
    return resError(res, "Failed to build monthly reports.", 500);
  }
};

module.exports = {
  getMonthlyReports,
};
