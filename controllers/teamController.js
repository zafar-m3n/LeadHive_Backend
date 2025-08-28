const { Team, TeamMember, TeamManager, User } = require("../models");
const { resSuccess, resError } = require("../utils/responseUtil");
const { Op } = require("sequelize");

/**
 * Create a new team (with members)
 * Body: { name, manager_ids: [user_ids], members: [user_ids] }
 */
const createTeam = async (req, res) => {
  try {
    const { name, manager_ids = [], members = [] } = req.body;

    if (!name || manager_ids.length === 0) {
      return resError(res, "Team name and at least one manager are required", 400);
    }

    // Create the team
    const team = await Team.create({ name });

    // Add managers to the team
    if (Array.isArray(manager_ids) && manager_ids.length > 0) {
      const validManagers = await User.findAll({
        where: { id: { [Op.in]: manager_ids }, is_active: true },
        attributes: ["id"],
      });

      const bulkManagers = validManagers.map((u) => ({
        team_id: team.id,
        manager_id: u.id,
      }));

      await TeamManager.bulkCreate(bulkManagers);
    }

    // Add members if provided
    if (Array.isArray(members) && members.length > 0) {
      const validMembers = await User.findAll({
        where: { id: { [Op.in]: members }, is_active: true },
        attributes: ["id"],
      });

      const bulkMembers = validMembers.map((u) => ({
        team_id: team.id,
        user_id: u.id,
      }));

      await TeamMember.bulkCreate(bulkMembers);
    }

    // Fetch created team with relations
    const created = await Team.findByPk(team.id, {
      include: [
        { model: User, as: "manager", attributes: ["id", "full_name", "email"] },
        { model: User, through: { attributes: [] }, attributes: ["id", "full_name", "email"] },
      ],
    });

    return resSuccess(res, created, 201);
  } catch (err) {
    console.error("CreateTeam Error:", err);
    return resError(res, "Internal server error", 500);
  }
};

/**
 * Get all teams with manager and members + pagination
 * Query params: ?page=1&limit=10
 */
const getTeams = async (req, res) => {
  try {
    let { page = 1, limit = 10 } = req.query;
    page = parseInt(page);
    limit = parseInt(limit);
    const offset = (page - 1) * limit;

    const { count, rows } = await Team.findAndCountAll({
      include: [
        { model: User, as: "manager", attributes: ["id", "full_name", "email"] },
        { model: User, through: { attributes: [] }, attributes: ["id", "full_name", "email"] },
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
        { model: User, as: "manager", attributes: ["id", "full_name", "email"] },
        { model: User, through: { attributes: [] }, attributes: ["id", "full_name", "email"] },
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
 * Body: { name?, manager_ids?: [user_ids], members?: [user_ids] }
 */
const updateTeam = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, manager_ids, members } = req.body;

    const team = await Team.findByPk(id);
    if (!team) return resError(res, "Team not found", 404);

    if (name !== undefined) team.name = name;
    await team.save();

    // Handle manager updates (replace all managers)
    if (Array.isArray(manager_ids)) {
      // Remove existing managers
      await TeamManager.destroy({ where: { team_id: id } });

      // Add new managers
      const validManagers = await User.findAll({
        where: { id: { [Op.in]: manager_ids }, is_active: true },
        attributes: ["id"],
      });

      const bulkManagers = validManagers.map((u) => ({
        team_id: id,
        manager_id: u.id,
      }));

      await TeamManager.bulkCreate(bulkManagers);
    }

    // Handle members update (replace)
    if (Array.isArray(members)) {
      // Remove existing members
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

        await TeamMember.bulkCreate(bulkMembers);
      }
    }

    const updated = await Team.findByPk(id, {
      include: [
        { model: User, as: "manager", attributes: ["id", "full_name", "email"] },
        { model: User, through: { attributes: [] }, attributes: ["id", "full_name", "email"] },
      ],
    });

    return resSuccess(res, updated);
  } catch (err) {
    console.error("UpdateTeam Error:", err);
    return resError(res, "Internal server error", 500);
  }
};

/**
 * Delete team (remove members first, then team)
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
 * Add a member to team
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
 * Remove a member from team
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
 * Get the team that the current user is managing
 */
const getMyTeam = async (req, res) => {
  try {
    const managerId = req.user.id;

    const team = await Team.findOne({
      where: { manager_id: managerId },
      include: [
        { model: User, as: "manager", attributes: ["id", "full_name", "email"] },
        // ⚠️ Use the association alias "Users" for the many-to-many members
        {
          model: User,
          as: "Users",
          through: { attributes: [] },
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
 * Remove a member from the current user's team
 */
const removeMemberFromMyTeam = async (req, res) => {
  try {
    const managerId = req.user.id;
    const { userId } = req.params;

    const team = await Team.findOne({
      where: { manager_id: managerId },
      attributes: ["id", "manager_id"],
    });
    if (!team) return resError(res, "You don't have a team yet.", 404);

    if (Number(userId) === Number(managerId)) {
      return resError(res, "Cannot remove the manager from the team.", 400);
    }

    const membership = await TeamMember.findOne({
      where: { team_id: team.id, user_id: Number(userId) },
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
