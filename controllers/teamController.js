// controllers/teamController.js
const { Team, TeamMember, TeamManager, User } = require("../models");
const { resSuccess, resError } = require("../utils/responseUtil");
const { Op } = require("sequelize");

/**
 * Create a new team (with managers and members)
 * Body: { name, manager_ids: number[], members?: number[] }
 */
const createTeam = async (req, res) => {
  try {
    const { name, manager_ids = [], members = [] } = req.body;

    if (!name || !Array.isArray(manager_ids) || manager_ids.length === 0) {
      return resError(res, "Team name and at least one manager are required", 400);
    }

    // Create team
    const team = await Team.create({ name });

    // Add managers via TeamManager
    if (manager_ids.length > 0) {
      const validManagers = await User.findAll({
        where: { id: { [Op.in]: manager_ids }, is_active: true },
        attributes: ["id"],
      });

      const bulkManagers = validManagers.map((u) => ({
        team_id: team.id,
        manager_id: u.id,
      }));
      if (bulkManagers.length > 0) {
        await TeamManager.bulkCreate(bulkManagers);
      }
    }

    // Add members via TeamMember
    if (Array.isArray(members) && members.length > 0) {
      const validMembers = await User.findAll({
        where: { id: { [Op.in]: members }, is_active: true },
        attributes: ["id"],
      });

      const bulkMembers = validMembers.map((u) => ({
        team_id: team.id,
        user_id: u.id,
      }));
      if (bulkMembers.length > 0) {
        await TeamMember.bulkCreate(bulkMembers);
      }
    }

    // Fetch created team with relations (using aliases)
    const created = await Team.findByPk(team.id, {
      include: [
        {
          model: User,
          as: "managers",
          through: { model: TeamManager, attributes: [] },
          attributes: ["id", "full_name", "email"],
          required: false,
        },
        {
          model: User,
          as: "members",
          through: { model: TeamMember, attributes: [] },
          attributes: ["id", "full_name", "email"],
          required: false,
        },
      ],
    });

    return resSuccess(res, created, 201);
  } catch (err) {
    console.error("CreateTeam Error:", err);
    return resError(res, "Internal server error", 500);
  }
};

/**
 * Get all teams with managers and members + pagination
 * Query params: ?page=1&limit=10
 */
const getTeams = async (req, res) => {
  try {
    let { page = 1, limit = 10 } = req.query;

    page = parseInt(page, 10);
    limit = parseInt(limit, 10);
    if (Number.isNaN(page) || page < 1) page = 1;
    if (Number.isNaN(limit) || limit < 1) limit = 10;

    const offset = (page - 1) * limit;

    const { count, rows } = await Team.findAndCountAll({
      include: [
        {
          model: User,
          as: "managers",
          through: { model: TeamManager, attributes: [] },
          attributes: ["id", "full_name", "email"],
          required: false,
        },
        {
          model: User,
          as: "members",
          through: { model: TeamMember, attributes: [] },
          attributes: ["id", "full_name", "email"],
          required: false,
        },
      ],
      order: [["id", "ASC"]],
      offset,
      limit,
    });

    return resSuccess(res, {
      total: count,
      page,
      limit,
      pages: Math.ceil(count / limit),
      teams: rows,
    });
  } catch (err) {
    console.error("GetTeams Error:", err);
    return resError(res, "Internal server error", 500);
  }
};

/**
 * Get single team by ID
 */
const getTeamById = async (req, res) => {
  try {
    const { id } = req.params;

    const team = await Team.findByPk(id, {
      include: [
        {
          model: User,
          as: "managers",
          through: { model: TeamManager, attributes: [] },
          attributes: ["id", "full_name", "email"],
          required: false,
        },
        {
          model: User,
          as: "members",
          through: { model: TeamMember, attributes: [] },
          attributes: ["id", "full_name", "email"],
          required: false,
        },
      ],
    });

    if (!team) return resError(res, "Team not found", 404);

    return resSuccess(res, team);
  } catch (err) {
    console.error("GetTeamById Error:", err);
    return resError(res, "Internal server error", 500);
  }
};

/**
 * Update team (name, manager(s), members)
 * Body: { name?, manager_ids?: number[], members?: number[] }
 */
const updateTeam = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, manager_ids, members } = req.body;

    const team = await Team.findByPk(id);
    if (!team) return resError(res, "Team not found", 404);

    if (name !== undefined) {
      team.name = name;
      await team.save();
    }

    // Replace all managers if manager_ids provided
    if (Array.isArray(manager_ids)) {
      await TeamManager.destroy({ where: { team_id: id } });

      if (manager_ids.length > 0) {
        const validManagers = await User.findAll({
          where: { id: { [Op.in]: manager_ids }, is_active: true },
          attributes: ["id"],
        });

        const bulkManagers = validManagers.map((u) => ({
          team_id: id,
          manager_id: u.id,
        }));
        if (bulkManagers.length > 0) {
          await TeamManager.bulkCreate(bulkManagers);
        }
      }
    }

    // Replace all members if members provided
    if (Array.isArray(members)) {
      await TeamMember.destroy({ where: { team_id: id } });

      if (members.length > 0) {
        const validUsers = await User.findAll({
          where: { id: { [Op.in]: members }, is_active: true },
          attributes: ["id"],
        });

        const bulkMembers = validUsers.map((u) => ({
          team_id: id,
          user_id: u.id,
        }));
        if (bulkMembers.length > 0) {
          await TeamMember.bulkCreate(bulkMembers);
        }
      }
    }

    const updated = await Team.findByPk(id, {
      include: [
        {
          model: User,
          as: "managers",
          through: { model: TeamManager, attributes: [] },
          attributes: ["id", "full_name", "email"],
          required: false,
        },
        {
          model: User,
          as: "members",
          through: { model: TeamMember, attributes: [] },
          attributes: ["id", "full_name", "email"],
          required: false,
        },
      ],
    });

    return resSuccess(res, updated);
  } catch (err) {
    console.error("UpdateTeam Error:", err);
    return resError(res, "Internal server error", 500);
  }
};

/**
 * Delete team (remove members & managers first, then team)
 */
const deleteTeam = async (req, res) => {
  try {
    const { id } = req.params;

    const team = await Team.findByPk(id);
    if (!team) return resError(res, "Team not found", 404);

    await TeamMember.destroy({ where: { team_id: id } });
    await TeamManager.destroy({ where: { team_id: id } });
    await team.destroy();

    return resSuccess(res, { message: "Team deleted successfully" });
  } catch (err) {
    console.error("DeleteTeam Error:", err);
    return resError(res, "Internal server error", 500);
  }
};

/**
 * Add a member to a team
 * Body: { user_id }
 */
const addMemberToTeam = async (req, res) => {
  try {
    const { id } = req.params; // team_id
    const { user_id } = req.body;

    const team = await Team.findByPk(id);
    if (!team) return resError(res, "Team not found", 404);

    const user = await User.findByPk(user_id);
    if (!user) return resError(res, "User not found", 404);

    const exists = await TeamMember.findOne({ where: { team_id: id, user_id } });
    if (exists) return resError(res, "User already in team", 400);

    await TeamMember.create({ team_id: id, user_id });
    return resSuccess(res, { message: "Member added successfully" }, 201);
  } catch (err) {
    console.error("AddMember Error:", err);
    return resError(res, "Internal server error", 500);
  }
};

/**
 * Remove a member from a team
 */
const removeMemberFromTeam = async (req, res) => {
  try {
    const { id, userId } = req.params; // id = team_id, userId = user_id

    const membership = await TeamMember.findOne({ where: { team_id: id, user_id: userId } });
    if (!membership) return resError(res, "User is not in this team", 404);

    await membership.destroy();
    return resSuccess(res, { message: "Member removed successfully" });
  } catch (err) {
    console.error("RemoveMember Error:", err);
    return resError(res, "Internal server error", 500);
  }
};

/**
 * GET /api/v1/teams/my
 * Get ONE team that the current user manages (via TeamManager)
 * NOTE: if a manager can manage multiple teams, you may want a /my/list endpoint.
 */
const getMyTeam = async (req, res) => {
  try {
    const managerId = req.user.id;

    // Find any team_id where this user is a manager
    const tm = await TeamManager.findOne({
      where: { manager_id: managerId },
      attributes: ["team_id"],
    });

    if (!tm) return resError(res, "You don't have a team yet.", 404);

    const team = await Team.findByPk(tm.team_id, {
      include: [
        {
          model: User,
          as: "managers",
          through: { model: TeamManager, attributes: [] },
          attributes: ["id", "full_name", "email"],
          required: false,
        },
        {
          model: User,
          as: "members",
          through: { model: TeamMember, attributes: [] },
          attributes: ["id", "full_name", "email"],
          required: false,
        },
      ],
    });

    if (!team) return resError(res, "You don't have a team yet.", 404);
    return resSuccess(res, team);
  } catch (err) {
    console.error("getMyTeam Error:", err);
    return resError(res, "Internal server error", 500);
  }
};

/**
 * DELETE /api/v1/teams/my/members/:userId
 * Remove a member from the current user's team (via TeamManager)
 */
const removeMemberFromMyTeam = async (req, res) => {
  try {
    const managerId = req.user.id;
    const { userId } = req.params;

    const tm = await TeamManager.findOne({
      where: { manager_id: managerId },
      attributes: ["team_id"],
    });
    if (!tm) return resError(res, "You don't have a team yet.", 404);

    if (Number(userId) === Number(managerId)) {
      return resError(res, "Cannot remove the manager from the team.", 400);
    }

    const membership = await TeamMember.findOne({
      where: { team_id: tm.team_id, user_id: Number(userId) },
    });
    if (!membership) return resError(res, "User is not in your team.", 404);

    await membership.destroy();
    return resSuccess(res, { message: "Member removed successfully" });
  } catch (err) {
    console.error("removeMemberFromMyTeam Error:", err);
    return resError(res, "Internal server error", 500);
  }
};

// =============================
// Exports
// =============================
module.exports = {
  createTeam,
  getTeams,
  getTeamById,
  updateTeam,
  deleteTeam,
  addMemberToTeam,
  removeMemberFromTeam,
  getMyTeam,
  removeMemberFromMyTeam,
};
