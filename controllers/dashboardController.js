const { Lead, LeadStatus, LeadSource, LeadAssignment, User, Team } = require("../models");

// ==============================
// Dashboard Controller
// ==============================

// Get overall summary stats
const getSummaryStats = async (req, res) => {
  try {
    const { role, id } = req.user;

    let whereClause = {};
    let userIds = [];

    if (role === "manager") {
      // manager -> leads assigned to their team members
      const teams = await Team.findAll({ where: { manager_id: id } });
      const teamIds = teams.map((t) => t.id);

      const teamMembers = await User.findAll({
        include: [{ model: Team, where: { id: teamIds } }],
      });

      userIds = teamMembers.map((u) => u.id).concat([id]);
      whereClause = { "$LeadAssignments.assignee_id$": userIds };
    } else if (role === "sales_rep") {
      // sales rep -> only their assigned leads
      whereClause = { "$LeadAssignments.assignee_id$": id };
    }

    const totalLeads = await Lead.count({ where: whereClause });
    const leadsByStatus = await Lead.findAll({
      where: whereClause,
      include: [{ model: LeadStatus }],
      attributes: ["status_id", [Lead.sequelize.fn("COUNT", Lead.sequelize.col("Lead.id")), "count"]],
      group: ["status_id", "LeadStatus.id"],
    });
    const leadsBySource = await Lead.findAll({
      where: whereClause,
      include: [{ model: LeadSource }],
      attributes: ["source_id", [Lead.sequelize.fn("COUNT", Lead.sequelize.col("Lead.id")), "count"]],
      group: ["source_id", "LeadSource.id"],
    });

    return res.json({
      success: true,
      data: {
        totalLeads,
        leadsByStatus,
        leadsBySource,
      },
    });
  } catch (err) {
    console.error("Dashboard Error:", err);
    res.status(500).json({ success: false, error: "Failed to fetch dashboard stats" });
  }
};

// Leads assigned to current user (sales rep or manager overview)
const getMyAssignments = async (req, res) => {
  try {
    const { id } = req.user;

    const assignments = await LeadAssignment.findAll({
      where: { assignee_id: id },
      include: [{ model: Lead }],
    });

    return res.json({
      success: true,
      data: assignments,
    });
  } catch (err) {
    console.error("Dashboard MyAssignments Error:", err);
    res.status(500).json({ success: false, error: "Failed to fetch my assignments" });
  }
};

module.exports = {
  getSummaryStats,
  getMyAssignments,
};
