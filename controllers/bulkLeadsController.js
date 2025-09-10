"use strict";

const { Op, literal, Sequelize } = require("sequelize");
const { Lead, LeadAssignment, User, Role, Team, TeamMember, TeamManager } = require("../models");
const { sequelize } = require("../config/database");
const { resSuccess, resError } = require("../utils/responseUtil");

// Subquery: latest assignment row id per lead (re-using style in your leadController)
const LATEST_ASSIGNMENT_IDS = literal(`(SELECT MAX(id) FROM lead_assignments GROUP BY lead_id)`);

// --- Helpers ---------------------------------------------------------------

// Get role value of a user (e.g., "admin" | "manager" | "sales_rep")
async function getUserRoleValue(userId) {
  const u = await User.findByPk(userId, {
    include: [{ model: Role, attributes: ["value"] }],
    attributes: ["id", "role_id"],
  });
  // Your User belongsTo(Role), so Role is singular:
  return u?.Role?.value || null;
}

// Manager scope check: is a given sales rep in ANY team managed by this manager?
async function isRepUnderManager(managerId, repId) {
  // team ids this manager manages
  const teamsManaged = await TeamManager.findAll({
    where: { manager_id: managerId },
    attributes: ["team_id"],
  });
  const teamIds = teamsManaged.map((t) => t.team_id);
  if (!teamIds.length) return false;

  // is rep a member of at least one of those teams
  const membership = await TeamMember.findOne({
    where: {
      team_id: { [Op.in]: teamIds },
      user_id: repId,
    },
    attributes: ["team_id", "user_id"],
  });

  return !!membership;
}

// Fetch latest assignment for a batch of leads in one call
async function getLatestAssignmentsMap(leadIds) {
  if (!leadIds.length) return new Map();

  const latestRows = await LeadAssignment.findAll({
    where: {
      id: { [Op.in]: LATEST_ASSIGNMENT_IDS },
      lead_id: { [Op.in]: leadIds },
    },
    attributes: ["id", "lead_id", "assignee_id"],
  });

  const map = new Map();
  for (const row of latestRows) {
    map.set(row.lead_id, row.assignee_id);
  }
  return map;
}

// --- Controllers -----------------------------------------------------------

/**
 * POST /api/v1/leads/bulk-assign
 * Body: { lead_ids: number[], assignee_id: number, overwrite?: boolean }
 * Rules:
 *  - admin  -> assignee must be manager
 *  - manager-> assignee must be sales_rep AND within manager's teams
 * Effect:
 *  - append rows to lead_assignments (no DB schema change)
 *  - if overwrite=false, skip leads whose latest assignee is someone else
 */
const bulkAssign = async (req, res) => {
  try {
    const { lead_ids = [], assignee_id, overwrite = false } = req.body || {};
    const actorId = req.user?.id;
    const actorRole = req.user?.role; // you already set req.user.role to "admin"/"manager"/"sales_rep"

    if (!Array.isArray(lead_ids) || !lead_ids.length) {
      return resError(res, "lead_ids[] is required.", 400);
    }
    if (!assignee_id) return resError(res, "assignee_id is required.", 400);

    // Validate roles
    const assigneeRole = await getUserRoleValue(assignee_id);
    if (!assigneeRole) return resError(res, "Assignee not found.", 404);

    if (actorRole === "admin") {
      if (assigneeRole !== "manager") {
        return resError(res, "Admin can only bulk-assign to managers.", 403);
      }
    } else if (actorRole === "manager") {
      if (assigneeRole !== "sales_rep") {
        return resError(res, "Manager can only bulk-assign to sales reps.", 403);
      }
      const ok = await isRepUnderManager(actorId, assignee_id);
      if (!ok) return resError(res, "Selected sales rep is not in your managed teams.", 403);
    } else {
      return resError(res, "Forbidden.", 403);
    }

    // Validate that requested leads exist
    const leads = await Lead.findAll({
      where: { id: { [Op.in]: lead_ids } },
      attributes: ["id"],
    });
    const foundIds = new Set(leads.map((l) => l.id));
    const missing = lead_ids.filter((id) => !foundIds.has(id));

    // Latest assignees for found leads
    const latestMap = await getLatestAssignmentsMap([...foundIds]);

    // Build worklist
    const toCreate = [];
    const skipped = []; // { id, reason }
    for (const id of foundIds) {
      const current = latestMap.get(id) ?? null;

      // If overwrite=false and there is an assignee different from target, skip
      if (!overwrite && current && current !== assignee_id) {
        skipped.push({ id, reason: "already_assigned" });
        continue;
      }
      // If current already equals target, we can skip as no-op (or still add history if you want)
      if (!overwrite && current === assignee_id) {
        skipped.push({ id, reason: "already_assigned_to_target" });
        continue;
      }

      toCreate.push({
        lead_id: id,
        assignee_id,
        assigned_by: actorId,
      });
    }

    let created = 0;
    if (toCreate.length) {
      await sequelize.transaction(async (t) => {
        // Bulk create in chunks to avoid huge single INSERT, if needed
        const CHUNK = 1000;
        for (let i = 0; i < toCreate.length; i += CHUNK) {
          const slice = toCreate.slice(i, i + CHUNK);
          await LeadAssignment.bulkCreate(slice, { transaction: t });
          created += slice.length;
        }
      });
    }

    return resSuccess(res, {
      total_requested: lead_ids.length,
      updated: created,
      skipped,
      missing,
      assignee_id,
      overwrite: !!overwrite,
    });
  } catch (err) {
    console.error("BulkAssign Error:", err);
    return resError(res, "Bulk assign failed.", 500);
  }
};

/**
 * GET /api/v1/leads/assignable-targets
 * Return only valid targets for the actor:
 *  - admin: active users
 *  - manager: active sales reps in any of their managed teams
 */
const getAssignableTargets = async (req, res) => {
  try {
    const actorId = req.user?.id;
    const role = req.user?.role;

    if (role === "admin") {
      const users = await User.findAll({
        where: { is_active: true },
        include: [{ model: Role, attributes: [] }],
        attributes: ["id", "full_name", "email"],
        order: [["full_name", "ASC"]],
      });
      return resSuccess(res, { role: "admin", targets: users });
    }

    if (role === "manager") {
      // team ids this manager manages
      const managed = await TeamManager.findAll({
        where: { manager_id: actorId },
        attributes: ["team_id"],
      });
      const teamIds = managed.map((m) => m.team_id);
      if (!teamIds.length) return resSuccess(res, { role: "manager", targets: [] });

      // distinct sales reps in those teams
      const reps = await User.findAll({
        where: { is_active: true },
        include: [
          { model: Role, where: { value: "sales_rep" }, attributes: [] },
          {
            model: Team,
            as: "memberOfTeams",
            attributes: [],
            through: { attributes: [] },
            where: { id: { [Op.in]: teamIds } },
            required: true,
          },
        ],
        attributes: ["id", "full_name", "email"],
        order: [["full_name", "ASC"]],
      });

      return resSuccess(res, { role: "manager", targets: reps });
    }

    return resError(res, "Forbidden.", 403);
  } catch (err) {
    console.error("getAssignableTargets Error:", err);
    return resError(res, "Failed to load assignable targets.", 500);
  }
};

/**
 * DELETE /api/v1/leads/bulk-delete
 * Body: { lead_ids: number[] }
 *
 * Rules:
 *  - admin  -> may delete any of the provided leads
 *  - manager-> may delete any of the provided leads
 *  - sales_rep -> forbidden
 *
 * Effect:
 *  - Hard delete leads and their LeadAssignments (no schema change).
 *  - Returns: { requested, deleted, missing }
 */
const bulkDeleteLeads = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { lead_ids = [] } = req.body || {};
    const actorRole = req.user?.role; // "admin" | "manager" | "sales_rep"

    if (!Array.isArray(lead_ids) || lead_ids.length === 0) {
      await t.rollback();
      return resError(res, "lead_ids[] is required.", 400);
    }

    if (actorRole === "sales_rep") {
      await t.rollback();
      return resError(res, "Forbidden.", 403);
    }

    // 1) Load the leads that exist
    const leads = await Lead.findAll({
      where: { id: { [Op.in]: lead_ids } },
      attributes: ["id"],
      transaction: t,
    });

    const foundIds = new Set(leads.map((l) => l.id));
    const missing = lead_ids.filter((id) => !foundIds.has(id));

    if (foundIds.size === 0) {
      await t.rollback();
      return resSuccess(res, {
        requested: lead_ids.length,
        deleted: 0,
        missing,
      });
    }

    const idsToDelete = [...foundIds];

    // 2) Hard-delete: remove assignments, then leads
    //    If you have ON DELETE CASCADE on lead_assignments.lead_id, you can omit the first destroy.
    await LeadAssignment.destroy({
      where: { lead_id: { [Op.in]: idsToDelete } },
      transaction: t,
    });

    const deletedCount = await Lead.destroy({
      where: { id: { [Op.in]: idsToDelete } },
      transaction: t,
    });

    await t.commit();

    return resSuccess(res, {
      requested: lead_ids.length,
      deleted: deletedCount,
      missing,
    });
  } catch (err) {
    console.error("BulkDeleteLeads Error:", err);
    try {
      await t.rollback();
    } catch (_) {}
    return resError(res, "Bulk delete failed.", 500);
  }
};

// --------------------------------------------------------------------------

module.exports = {
  bulkAssign,
  getAssignableTargets,
  bulkDeleteLeads,
};
