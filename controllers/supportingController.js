const { Role, LeadStatus, LeadSource, User, Team, TeamMember } = require("../models");
const { resSuccess, resError } = require("../utils/responseUtil");
const { Op } = require("sequelize");

// ==============================
// Supporting Controller
// ==============================

// ✅ Get all lead statuses
const getLeadStatuses = async (req, res) => {
  try {
    const statuses = await LeadStatus.findAll({ order: [["id", "ASC"]] });
    return resSuccess(res, statuses);
  } catch (err) {
    console.error("Error fetching lead statuses:", err);
    return resError(res, "Server error fetching lead statuses.");
  }
};

// ✅ Get all lead sources
const getLeadSources = async (req, res) => {
  try {
    const sources = await LeadSource.findAll({ order: [["id", "ASC"]] });
    return resSuccess(res, sources);
  } catch (err) {
    console.error("Error fetching lead sources:", err);
    return resError(res, "Server error fetching lead sources.");
  }
};

// ✅ Get all roles
const getRoles = async (req, res) => {
  try {
    const roles = await Role.findAll({ order: [["id", "ASC"]] });
    return resSuccess(res, roles);
  } catch (err) {
    console.error("Error fetching roles:", err);
    return resError(res, "Server error fetching roles.");
  }
};

// ✅ Get all managers
const getManagers = async (req, res) => {
  try {
    const managers = await User.findAll({
      where: { is_active: true },
      include: [
        {
          model: Role,
          where: { value: "manager" }, // role value must be 'manager'
          attributes: [],
        },
      ],
      attributes: ["id", "full_name", "email"],
    });
    return resSuccess(res, managers);
  } catch (err) {
    console.error("Error fetching managers:", err);
    return resError(res, "Server error fetching managers.");
  }
};

// ✅ Get all managers & admins (for assigning leads)
const getManagersAndAdmins = async (req, res) => {
  try {
    const users = await User.findAll({
      where: { is_active: true },
      include: [
        {
          model: Role,
          where: { value: ["manager", "admin"] }, // both roles
          attributes: [],
        },
      ],
      attributes: ["id", "full_name", "email"],
    });
    return resSuccess(res, users);
  } catch (err) {
    console.error("Error fetching managers & admins:", err);
    return resError(res, "Server error fetching managers & admins.");
  }
};

// ✅ Get all team members for a manager’s team
const getTeamMembers = async (req, res) => {
  try {
    const { teamId } = req.params;

    const team = await Team.findByPk(teamId, {
      include: [
        {
          model: User,
          through: { attributes: [] }, // hide join table
          attributes: ["id", "full_name", "email"],
        },
      ],
    });

    if (!team) {
      return resError(res, "Team not found.", 404);
    }

    return resSuccess(res, team.Users);
  } catch (err) {
    console.error("Error fetching team members:", err);
    return resError(res, "Server error fetching team members.");
  }
};

// ✅ Get unassigned active sales reps
const getUnassignedSalesReps = async (req, res) => {
  try {
    // 1. Find all active users with role = 'salesrep'
    const salesReps = await User.findAll({
      where: { is_active: true },
      include: [
        {
          model: Role,
          where: { value: "sales_rep" },
          attributes: [],
        },
      ],
      attributes: ["id", "full_name", "email"],
    });

    // 2. Get all assigned user IDs from TeamMembers
    const assignedMembers = await TeamMember.findAll({ attributes: ["user_id"] });
    const assignedIds = assignedMembers.map((m) => m.user_id);

    // 3. Filter out assigned reps
    const unassignedReps = salesReps.filter((rep) => !assignedIds.includes(rep.id));

    return resSuccess(res, unassignedReps);
  } catch (err) {
    console.error("Error fetching unassigned sales reps:", err);
    return resError(res, "Server error fetching unassigned sales reps.");
  }
};

// ✅ Get assignees visible to a manager: all their team members + all admins + the manager themself
const getAssignableUsersForManager = async (req, res) => {
  try {
    // Find teams managed by the current user
    const teams = await Team.findAll({
      where: { manager_id: req.user.id },
      attributes: ["id"],
    });
    const teamIds = teams.map((t) => t.id);

    // Team members (active sales reps in those teams)
    let teamMembers = [];
    if (teamIds.length) {
      teamMembers = await User.findAll({
        where: { is_active: true },
        include: [
          { model: Role, where: { value: "sales_rep" }, attributes: [] },
          { model: Team, where: { id: { [Op.in]: teamIds } }, through: { attributes: [] }, attributes: [] },
        ],
        attributes: ["id", "full_name", "email"],
      });
    }

    // All active admins
    const admins = await User.findAll({
      where: { is_active: true },
      include: [{ model: Role, where: { value: "admin" }, attributes: [] }],
      attributes: ["id", "full_name", "email"],
    });

    // Current manager (self) – include if active
    const self = await User.findByPk(req.user.id, {
      attributes: ["id", "full_name", "email", "is_active"],
    });
    const selfEntry = self && self.is_active ? [{ id: self.id, full_name: self.full_name, email: self.email }] : [];

    // Combine and de-duplicate by id
    const combined = [...selfEntry, ...teamMembers, ...admins];
    const uniqueById = Array.from(new Map(combined.map((u) => [u.id, u])).values());

    return resSuccess(res, uniqueById);
  } catch (err) {
    console.error("Error fetching assignable users for manager:", err);
    return resError(res, "Server error fetching assignable users.");
  }
};

// ==============================
// Exports
// ==============================
module.exports = {
  getLeadStatuses,
  getLeadSources,
  getRoles,
  getManagers,
  getManagersAndAdmins,
  getTeamMembers,
  getUnassignedSalesReps,
  getAssignableUsersForManager,
};
