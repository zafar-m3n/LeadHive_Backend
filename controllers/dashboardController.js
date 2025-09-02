const {
  Lead,
  LeadStatus,
  LeadSource,
  LeadAssignment,
  Team,
  TeamMember, // through table for team membership
  TeamManager, // ⬅ added for multi-manager lookup
} = require("../models");
const { Op, fn, col, literal } = require("sequelize");
const { resSuccess, resError } = require("../utils/responseUtil");

// ==============================
// Shared helpers
// ==============================

/** Build the include used to scope by assignees via LeadAssignments */
const buildAssignmentInclude = (assigneeIdsOrNull) => {
  if (!assigneeIdsOrNull) {
    // admin: no restriction; optional join
    return {
      model: LeadAssignment,
      as: "LeadAssignments",
      attributes: [],
      required: false,
    };
  }
  // scoped roles
  return {
    model: LeadAssignment,
    as: "LeadAssignments",
    attributes: [],
    required: true,
    where: { assignee_id: { [Op.in]: assigneeIdsOrNull } },
  };
};

/** Normalize breakdown so it returns ALL statuses with zeroes where missing */
const normalizeStatusBreakdown = (allStatuses, countedRows) => {
  const map = new Map();
  for (const r of countedRows) {
    const statusId = r.status_id ?? r["status_id"];
    map.set(String(statusId), Number(r.count || 0));
  }
  return allStatuses.map((s) => ({
    status_id: s.id,
    count: map.get(String(s.id)) || 0,
    LeadStatus: { id: s.id, value: s.value, label: s.label },
  }));
};

/** Normalize breakdown so it returns ALL sources with zeroes where missing */
const normalizeSourceBreakdown = (allSources, countedRows) => {
  const map = new Map();
  for (const r of countedRows) {
    const sourceId = r.source_id ?? r["source_id"];
    map.set(String(sourceId), Number(r.count || 0));
  }
  return allSources.map((s) => ({
    source_id: s.id,
    count: map.get(String(s.id)) || 0,
    LeadSource: { id: s.id, value: s.value, label: s.label },
  }));
};

/** Core summary builder used by role-specific handlers */
const buildSummary = async ({
  assigneeIds = null,
  recentLimit = 10,
  includeAdminKPIs = false,
  adminUserId = null, // needed to compute "unassignedLeads" per your definition
}) => {
  const assignmentInclude = buildAssignmentInclude(assigneeIds);

  // Fetch master lists (for zero-filling)
  const [allStatuses, allSources] = await Promise.all([
    LeadStatus.findAll({ attributes: ["id", "value", "label"], order: [["id", "ASC"]] }),
    LeadSource.findAll({ attributes: ["id", "value", "label"], order: [["id", "ASC"]] }),
  ]);

  // total (distinct)
  const totalLeads = await Lead.count({
    include: [assignmentInclude],
    distinct: true,
    col: "id",
  });

  // KPIs
  let unassignedLeads = 0; // per requirement: "unassigned" == assigned to the admin
  let newThisWeek = 0;

  if (includeAdminKPIs) {
    // Count leads assigned to the CURRENT admin user
    unassignedLeads = await Lead.count({
      include: [
        {
          model: LeadAssignment,
          as: "LeadAssignments",
          attributes: [],
          required: true,
          where: { assignee_id: adminUserId },
        },
      ],
      distinct: true,
      col: "id",
    });

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    newThisWeek = await Lead.count({
      where: { created_at: { [Op.gte]: sevenDaysAgo } },
      include: [assignmentInclude],
      distinct: true,
      col: "id",
    });
  }

  // Breakdown by Status
  const rawStatusRows = await Lead.findAll({
    attributes: ["status_id", [fn("COUNT", fn("DISTINCT", col("Lead.id"))), "count"]],
    include: [assignmentInclude, { model: LeadStatus, attributes: [] }],
    group: ["status_id"],
    raw: true,
  });
  const leadsByStatus = normalizeStatusBreakdown(allStatuses, rawStatusRows);

  // Breakdown by Source
  const rawSourceRows = await Lead.findAll({
    attributes: ["source_id", [fn("COUNT", fn("DISTINCT", col("Lead.id"))), "count"]],
    include: [assignmentInclude, { model: LeadSource, attributes: [] }],
    group: ["source_id"],
    raw: true,
  });
  const leadsBySource = normalizeSourceBreakdown(allSources, rawSourceRows);

  // Recent leads list
  const recentLeads = await Lead.findAll({
    attributes: ["id", "first_name", "last_name", "email", "company", "created_at"],
    include: [
      assignmentInclude,
      { model: LeadStatus, attributes: ["id", "value", "label"] },
      { model: LeadSource, attributes: ["id", "value", "label"] },
    ],
    order: [["created_at", "DESC"]],
    limit: recentLimit,
  });

  return {
    totalLeads,
    leadsByStatus,
    leadsBySource,
    recentLeads,
    ...(includeAdminKPIs ? { unassignedLeads, newThisWeek } : {}),
  };
};

/** Resolve manager's assignee scope: self + all users in teams they manage (via TeamManager) */
const resolveManagerAssignees = async (managerId) => {
  // Teams managed by this user
  const tmRows = await TeamManager.findAll({
    where: { manager_id: managerId },
    attributes: ["team_id"],
    raw: true,
  });
  const teamIds = tmRows.map((r) => r.team_id);
  if (teamIds.length === 0) return [managerId];

  // Members of those teams
  const memberRows = await TeamMember.findAll({
    where: { team_id: { [Op.in]: teamIds } },
    attributes: ["user_id"],
    raw: true,
  });

  const memberIds = memberRows.map((r) => r.user_id);

  // De-dupe and include the manager themselves
  return Array.from(new Set([managerId, ...memberIds]));
};

// ==============================
// Role-specific summaries
// ==============================

/**
 * GET /api/v1/dashboard/summary/admin?recentLimit=5
 */
const getAdminSummary = async (req, res) => {
  try {
    const recentLimit = Number(req.query.recentLimit) > 0 ? Number(req.query.recentLimit) : 10;
    const data = await buildSummary({
      assigneeIds: null, // admin sees all
      recentLimit,
      includeAdminKPIs: true,
      adminUserId: req.user.id,
    });
    return resSuccess(res, data);
  } catch (err) {
    console.error("Dashboard Admin Summary Error:", err);
    return resError(res, "Failed to fetch admin summary");
  }
};

/**
 * GET /api/v1/dashboard/summary/manager?recentLimit=5
 * Returns: { self_leads, team_leads, leads_by_member, recent_team_leads }
 * NOTE: leads_by_member includes ALL team members (zero-filled).
 */
const getManagerSummary = async (req, res) => {
  try {
    const recentLimit = Number(req.query.recentLimit) > 0 ? Number(req.query.recentLimit) : 10;
    const manager_id = req.user.id;

    // Resolve manager scope (self + team members)
    const assignee_ids = await resolveManagerAssignees(manager_id);

    // Subquery: lead_ids whose LATEST assignment belongs to assignee_ids
    const inScopeLeadIds = (() => {
      if (!assignee_ids?.length) return literal("(SELECT 0)");
      const ids = assignee_ids.join(",");
      return literal(`
        (
          SELECT la.lead_id
          FROM lead_assignments la
          INNER JOIN (
            SELECT lead_id, MAX(id) AS max_id
            FROM lead_assignments
            GROUP BY lead_id
          ) t ON t.max_id = la.id
          WHERE la.assignee_id IN (${ids})
        )
      `);
    })();

    // Subquery: lead_ids whose latest assignment is the manager (self pipeline)
    const selfLeadIds = literal(`
      (
        SELECT la.lead_id
        FROM lead_assignments la
        INNER JOIN (
          SELECT lead_id, MAX(id) AS max_id
          FROM lead_assignments
          GROUP BY lead_id
        ) t ON t.max_id = la.id
        WHERE la.assignee_id = ${manager_id}
      )
    `);

    // Counts
    const [self_leads, team_leads] = await Promise.all([
      Lead.count({ where: { id: { [Op.in]: selfLeadIds } } }),
      Lead.count({ where: { id: { [Op.in]: inScopeLeadIds } } }),
    ]);

    // ------- Leads by member (normalize to include ALL team members with 0s) -------
    const { User } = require("../models");

    // Fetch team users (display info)
    const teamUsers = await User.findAll({
      where: { id: { [Op.in]: assignee_ids } },
      attributes: ["id", "full_name", "email"],
      order: [["full_name", "ASC"]],
      raw: true,
    });

    // Count only latest assignment per lead, grouped by assignee_id (within team)
    const latestGroupedRows = await LeadAssignment.findAll({
      attributes: ["assignee_id", [fn("COUNT", col("LeadAssignment.lead_id")), "count"]],
      where: {
        id: {
          [Op.in]: literal(`(SELECT MAX(id) FROM lead_assignments GROUP BY lead_id)`),
        },
        assignee_id: { [Op.in]: assignee_ids },
      },
      group: ["assignee_id"],
      raw: true,
    });

    const countMap = new Map();
    for (const r of latestGroupedRows) {
      countMap.set(String(r.assignee_id), Number(r.count || 0));
    }

    const leads_by_member = teamUsers
      .map((u) => ({
        assignee_id: u.id,
        count: countMap.get(String(u.id)) || 0,
        assignee: { id: u.id, full_name: u.full_name, email: u.email },
      }))
      .sort((a, b) => {
        if (b.count !== a.count) return b.count - a.count;
        return (a.assignee.full_name || "").localeCompare(b.assignee.full_name || "");
      });

    // Recent team leads (by created_at) within current team scope
    const recent_team_leads = await Lead.findAll({
      attributes: ["id", "first_name", "last_name", "email", "company", "created_at"],
      where: { id: { [Op.in]: inScopeLeadIds } },
      include: [
        { model: LeadStatus, attributes: ["id", "value", "label"] },
        { model: LeadSource, attributes: ["id", "value", "label"] },
      ],
      order: [["created_at", "DESC"]],
      limit: recentLimit,
    });

    return resSuccess(res, {
      self_leads,
      team_leads,
      leads_by_member,
      recent_team_leads,
    });
  } catch (err) {
    console.error("Dashboard Manager Summary Error:", err);
    return resError(res, "Failed to fetch manager summary");
  }
};

/**
 * GET /api/v1/dashboard/summary/sales_rep?recentLimit=8
 */
const getSalesRepSummary = async (req, res) => {
  try {
    const recentLimit = Number(req.query.recentLimit) > 0 ? Number(req.query.recentLimit) : 8;
    const userId = req.user.id;

    // Subquery: lead_ids whose LATEST assignment belongs to this user
    const latestAssignedToMeLeadIds = literal(`
      (
        SELECT la.lead_id
        FROM lead_assignments la
        INNER JOIN (
          SELECT lead_id, MAX(id) AS max_id
          FROM lead_assignments
          GROUP BY lead_id
        ) t ON t.max_id = la.id
        WHERE la.assignee_id = ${userId}
      )
    `);

    // Master lists (for zero-filling + metadata)
    const [allStatuses, allSources] = await Promise.all([
      LeadStatus.findAll({ attributes: ["id", "value", "label"], order: [["id", "ASC"]] }),
      LeadSource.findAll({ attributes: ["id", "value", "label"], order: [["id", "ASC"]] }),
    ]);

    // Find the numeric status_id for 'new' (case-insensitive)
    const newStatus = allStatuses.find((s) => String(s.value || "").toLowerCase() === "new");
    const newStatusId = newStatus?.id ?? null;

    // ---------- KPIs ----------
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    // Total in my pipeline (latest assignment = me)
    const assigned = await Lead.count({
      where: { id: { [Op.in]: latestAssignedToMeLeadIds } },
    });

    // New this week (by created_at) in my pipeline
    const newThisWeek = await Lead.count({
      where: {
        id: { [Op.in]: latestAssignedToMeLeadIds },
        created_at: { [Op.gte]: sevenDaysAgo },
      },
    });

    // Inbox/New (status value == 'new') in my pipeline (use status_id to avoid joins/aliases)
    const inboxNew = newStatusId
      ? await Lead.count({
          where: {
            id: { [Op.in]: latestAssignedToMeLeadIds },
            status_id: newStatusId,
          },
        })
      : 0;

    // Avg age (days) of leads in my pipeline
    const avgAgeRow = await Lead.findOne({
      attributes: [[fn("AVG", literal("DATEDIFF(NOW(), created_at)")), "avg_days"]],
      where: { id: { [Op.in]: latestAssignedToMeLeadIds } },
      raw: true,
    });
    const avgAgeDays = Number(avgAgeRow?.avg_days || 0);

    // ---------- Breakdown: by Status / by Source ----------
    const rawStatusRows = await Lead.findAll({
      attributes: ["status_id", [fn("COUNT", literal("*")), "count"]],
      where: { id: { [Op.in]: latestAssignedToMeLeadIds } },
      group: ["status_id"],
      raw: true,
    });

    const rawSourceRows = await Lead.findAll({
      attributes: ["source_id", [fn("COUNT", literal("*")), "count"]],
      where: { id: { [Op.in]: latestAssignedToMeLeadIds } },
      group: ["source_id"],
      raw: true,
    });

    // zero-fill + attach metadata
    const statusCountMap = new Map(rawStatusRows.map((r) => [String(r.status_id), Number(r.count || 0)]));
    const byStatus = allStatuses.map((s) => ({
      status_id: s.id,
      count: statusCountMap.get(String(s.id)) || 0,
      LeadStatus: { id: s.id, value: s.value, label: s.label },
    }));

    const sourceCountMap = new Map(
      rawSourceRows
        .filter((r) => r.source_id != null) // ignore NULL sources in breakdown
        .map((r) => [String(r.source_id), Number(r.count || 0)])
    );
    const bySource = allSources.map((s) => ({
      source_id: s.id,
      count: sourceCountMap.get(String(s.id)) || 0,
      LeadSource: { id: s.id, value: s.value, label: s.label },
    }));

    // ---------- Recent assigned to me (latest assignment per lead) ----------
    const recentAssigned = await LeadAssignment.findAll({
      attributes: ["id", "lead_id", "assignee_id", "assigned_at"],
      where: {
        assignee_id: userId,
        id: { [Op.in]: literal(`(SELECT MAX(id) FROM lead_assignments GROUP BY lead_id)`) },
      },
      include: [
        {
          model: Lead,
          attributes: ["id", "first_name", "last_name", "email", "company", "created_at", "updated_at"],
          include: [
            { model: LeadStatus, attributes: ["id", "value", "label"] },
            { model: LeadSource, attributes: ["id", "value", "label"] },
          ],
        },
      ],
      order: [["assigned_at", "DESC"]],
      limit: recentLimit,
    });

    // ---------- Recent updates in my pipeline ----------
    const recentUpdates = await Lead.findAll({
      attributes: ["id", "first_name", "last_name", "email", "company", "created_at", "updated_at"],
      where: { id: { [Op.in]: latestAssignedToMeLeadIds } },
      include: [
        { model: LeadStatus, attributes: ["id", "value", "label"] },
        { model: LeadSource, attributes: ["id", "value", "label"] },
      ],
      order: [["updated_at", "DESC"]],
      limit: recentLimit,
    });

    // ---------- Daily intake (last 14 days) ----------
    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 13); // inclusive 14-day window

    const dailyRows = await Lead.findAll({
      attributes: [
        [literal("DATE(created_at)"), "day"],
        [fn("COUNT", literal("*")), "count"],
      ],
      where: {
        id: { [Op.in]: latestAssignedToMeLeadIds },
        created_at: { [Op.gte]: fourteenDaysAgo },
      },
      group: [literal("DATE(created_at)")],
      order: [literal("DATE(created_at) ASC")],
      raw: true,
    });

    const dailyIntakeLast14 = dailyRows.map((r) => ({
      day: r.day, // 'YYYY-MM-DD'
      count: Number(r.count || 0),
    }));

    return resSuccess(res, {
      totals: { assigned, newThisWeek, inboxNew, avgAgeDays },
      byStatus,
      bySource,
      recentAssigned,
      recentUpdates,
      dailyIntakeLast14,
    });
  } catch (err) {
    console.error("Dashboard Sales Rep Summary Error:", err);
    return resError(res, "Failed to fetch sales rep summary");
  }
};

// ==============================
// Assignments (self)
// ==============================

/**
 * GET /api/v1/dashboard/assignments
 * Returns the current user's assignments (latest first).
 */
const getMyAssignments = async (req, res) => {
  try {
    const { id } = req.user;

    const assignments = await LeadAssignment.findAll({
      where: { assignee_id: id },
      include: [
        {
          model: Lead,
          include: [
            { model: LeadStatus, attributes: ["id", "value", "label"] },
            { model: LeadSource, attributes: ["id", "value", "label"] },
          ],
        },
      ],
      order: [["assigned_at", "DESC"]],
      limit: 25,
    });

    return resSuccess(res, assignments);
  } catch (err) {
    console.error("Dashboard MyAssignments Error:", err);
    return resError(res, "Failed to fetch my assignments");
  }
};

module.exports = {
  // role-specific summaries
  getAdminSummary,
  getManagerSummary,
  getSalesRepSummary,

  // self assignments
  getMyAssignments,
};
