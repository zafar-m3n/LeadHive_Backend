// controllers/dashboardController.js
const {
  Lead,
  LeadStatus,
  LeadSource,
  LeadAssignment,
  Team,
  TeamMember, // through table for team membership
} = require("../models");
const { Op, fn, col, literal, where } = require("sequelize");
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

/** Resolve manager's assignee scope: self + all users in teams they manage */
const resolveManagerAssignees = async (managerId) => {
  const teams = await Team.findAll({
    where: { manager_id: managerId },
    attributes: ["id"],
    raw: true,
  });
  const teamIds = teams.map((t) => t.id);
  if (teamIds.length === 0) return [managerId];

  const members = await TeamMember.findAll({
    where: { team_id: { [Op.in]: teamIds } },
    attributes: ["user_id"],
    raw: true,
  });
  const memberIds = members.map((m) => m.user_id);
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
 */
const getManagerSummary = async (req, res) => {
  try {
    const recentLimit = Number(req.query.recentLimit) > 0 ? Number(req.query.recentLimit) : 10;
    const assigneeIds = await resolveManagerAssignees(req.user.id);

    const data = await buildSummary({
      assigneeIds,
      recentLimit,
      includeAdminKPIs: false,
    });
    return resSuccess(res, data);
  } catch (err) {
    console.error("Dashboard Manager Summary Error:", err);
    return resError(res, "Failed to fetch manager summary");
  }
};

/**
 * GET /api/v1/dashboard/summary/sales_rep?recentLimit=5
 */
const getSalesRepSummary = async (req, res) => {
  try {
    const recentLimit = Number(req.query.recentLimit) > 0 ? Number(req.query.recentLimit) : 10;

    const data = await buildSummary({
      assigneeIds: [req.user.id],
      recentLimit,
      includeAdminKPIs: false,
    });
    return resSuccess(res, data);
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
      order: [["created_at", "DESC"]],
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
