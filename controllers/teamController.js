const { Team, TeamMember, User } = require("../models");
const { resSuccess, resError } = require("../utils/responseUtil");
const { Op } = require("sequelize");

/**
 * Create a new team (with members)
 * Body: { name, manager_id, members: [user_ids] }
 */
const createTeam = async (req, res) => {
  try {
    const { name, manager_id, members = [] } = req.body;

    if (!name || !manager_id) {
      return resError(res, "Team name and manager_id are required", 400);
    }

    // Check manager exists
    const manager = await User.findByPk(manager_id);
    if (!manager) return resError(res, "Manager not found", 404);

    const team = await Team.create({ name, manager_id });

    // Add members if provided
    if (Array.isArray(members) && members.length > 0) {
      const validUsers = await User.findAll({
        where: { id: { [Op.in]: members }, is_active: true },
        attributes: ["id"],
      });

      const bulkMembers = validUsers.map((u) => ({
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
 * Update team (name, manager, members)
 * Body: { name?, manager_id?, members?: [user_ids] }
 */
const updateTeam = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, manager_id, members } = req.body;

    const team = await Team.findByPk(id);
    if (!team) return resError(res, "Team not found", 404);

    if (name !== undefined) team.name = name;
    if (manager_id !== undefined) {
      const manager = await User.findByPk(manager_id);
      if (!manager) return resError(res, "Manager not found", 404);
      team.manager_id = manager_id;
    }
    await team.save();

    // Handle members update (replace)
    if (Array.isArray(members)) {
      // Remove existing
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
};
