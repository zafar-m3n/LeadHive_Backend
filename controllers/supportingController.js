const { Role, LeadStatus, LeadSource, User, Team, TeamMember } = require("../models");

// ==============================
// Supporting Controller
// ==============================

// ✅ Get all lead statuses
const getLeadStatuses = async (req, res) => {
  try {
    const statuses = await LeadStatus.findAll({ order: [["id", "ASC"]] });
    return res.json({ success: true, data: statuses });
  } catch (err) {
    console.error("Error fetching lead statuses:", err);
    return res.status(500).json({ success: false, error: "Server error fetching lead statuses." });
  }
};

// ✅ Get all lead sources
const getLeadSources = async (req, res) => {
  try {
    const sources = await LeadSource.findAll({ order: [["id", "ASC"]] });
    return res.json({ success: true, data: sources });
  } catch (err) {
    console.error("Error fetching lead sources:", err);
    return res.status(500).json({ success: false, error: "Server error fetching lead sources." });
  }
};

// ✅ Get all roles
const getRoles = async (req, res) => {
  try {
    const roles = await Role.findAll({ order: [["id", "ASC"]] });
    return res.json({ success: true, data: roles });
  } catch (err) {
    console.error("Error fetching roles:", err);
    return res.status(500).json({ success: false, error: "Server error fetching roles." });
  }
};

// ✅ Get all managers
const getManagers = async (req, res) => {
  try {
    const managers = await User.findAll({
      include: [
        {
          model: Role,
          where: { value: "manager" }, // role value must be 'manager'
          attributes: [],
        },
      ],
      attributes: ["id", "full_name", "email"],
    });
    return res.json({ success: true, data: managers });
  } catch (err) {
    console.error("Error fetching managers:", err);
    return res.status(500).json({ success: false, error: "Server error fetching managers." });
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
      return res.status(404).json({ success: false, error: "Team not found." });
    }

    return res.json({ success: true, data: team.Users });
  } catch (err) {
    console.error("Error fetching team members:", err);
    return res.status(500).json({ success: false, error: "Server error fetching team members." });
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
  getTeamMembers,
};
