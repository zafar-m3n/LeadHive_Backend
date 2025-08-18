// controllers/leadController.js
const { Op } = require("sequelize");
const { Lead, LeadStatus, LeadSource, User, LeadAssignment, Team, TeamMember } = require("../models");
const { resSuccess, resError } = require("../utils/responseUtil");

/**
 * Create a new lead
 * Body: { first_name?, last_name?, company?, email?, phone?, country?, status_id, source_id?, value_decimal?, notes? }
 */
const createLead = async (req, res) => {
  try {
    const { first_name, last_name, company, email, phone, country, status_id, source_id, value_decimal, notes } =
      req.body;

    if (!status_id) return resError(res, "status_id is required", 400);

    const lead = await Lead.create({
      first_name,
      last_name,
      company,
      email,
      phone,
      country,
      status_id,
      source_id,
      value_decimal: value_decimal || 0.0,
      notes,
      created_by: req.user.id,
    });

    return resSuccess(res, lead, 201);
  } catch (err) {
    console.error("CreateLead Error:", err);
    return resError(res, "Internal server error", 500);
  }
};

/**
 * Get leads by role
 * - Admin: all leads
 * - Manager: leads assigned to them OR their team members
 * - Sales Rep: only their leads
 */
const getLeads = async (req, res) => {
  try {
    const { role, id: userId } = req.user;

    let whereClause = {};

    if (role === "manager") {
      // Find teams managed by this manager
      const teams = await Team.findAll({ where: { manager_id: userId } });
      const teamIds = teams.map((t) => t.id);

      // Get team members (including the manager themselves)
      const teamMembers = await TeamMember.findAll({
        where: { team_id: { [Op.in]: teamIds } },
      });
      const teamUserIds = teamMembers.map((tm) => tm.user_id).concat(userId);

      // Restrict to leads assigned to team members
      const assignments = await LeadAssignment.findAll({
        where: { assignee_id: { [Op.in]: teamUserIds } },
      });
      const leadIds = assignments.map((a) => a.lead_id);

      whereClause = { id: { [Op.in]: leadIds } };
    }

    if (role === "sales_rep") {
      // Only leads assigned directly to this user
      const assignments = await LeadAssignment.findAll({
        where: { assignee_id: userId },
      });
      const leadIds = assignments.map((a) => a.lead_id);

      whereClause = { id: { [Op.in]: leadIds } };
    }

    // Admin sees all (no whereClause)

    const leads = await Lead.findAll({
      where: whereClause,
      include: [
        { model: LeadStatus, attributes: ["id", "value", "label"] },
        { model: LeadSource, attributes: ["id", "value", "label"] },
        { model: User, as: "creator", attributes: ["id", "full_name", "email"] },
        { model: User, as: "updater", attributes: ["id", "full_name", "email"] },
      ],
      order: [["id", "ASC"]],
    });

    return resSuccess(res, leads);
  } catch (err) {
    console.error("GetLeads Error:", err);
    return resError(res, "Internal server error", 500);
  }
};

/**
 * Get single lead by ID
 */
const getLeadById = async (req, res) => {
  try {
    const { id } = req.params;

    const lead = await Lead.findByPk(id, {
      include: [
        { model: LeadStatus, attributes: ["id", "value", "label"] },
        { model: LeadSource, attributes: ["id", "value", "label"] },
        { model: User, as: "creator", attributes: ["id", "full_name", "email"] },
        { model: User, as: "updater", attributes: ["id", "full_name", "email"] },
      ],
    });

    if (!lead) return resError(res, "Lead not found", 404);

    return resSuccess(res, lead);
  } catch (err) {
    console.error("GetLeadById Error:", err);
    return resError(res, "Internal server error", 500);
  }
};

/**
 * Update lead
 */
const updateLead = async (req, res) => {
  try {
    const { id } = req.params;

    const lead = await Lead.findByPk(id);
    if (!lead) return resError(res, "Lead not found", 404);

    const { first_name, last_name, company, email, phone, country, status_id, source_id, value_decimal, notes } =
      req.body;

    if (first_name !== undefined) lead.first_name = first_name;
    if (last_name !== undefined) lead.last_name = last_name;
    if (company !== undefined) lead.company = company;
    if (email !== undefined) lead.email = email;
    if (phone !== undefined) lead.phone = phone;
    if (country !== undefined) lead.country = country;
    if (status_id !== undefined) lead.status_id = status_id;
    if (source_id !== undefined) lead.source_id = source_id;
    if (value_decimal !== undefined) lead.value_decimal = value_decimal;
    if (notes !== undefined) lead.notes = notes;

    lead.updated_by = req.user.id;
    await lead.save();

    return resSuccess(res, lead);
  } catch (err) {
    console.error("UpdateLead Error:", err);
    return resError(res, "Internal server error", 500);
  }
};

/**
 * Delete lead (hard delete)
 */
const deleteLead = async (req, res) => {
  try {
    const { id } = req.params;

    const lead = await Lead.findByPk(id);
    if (!lead) return resError(res, "Lead not found", 404);

    await lead.destroy();

    return resSuccess(res, { message: "Lead deleted successfully" });
  } catch (err) {
    console.error("DeleteLead Error:", err);
    return resError(res, "Internal server error", 500);
  }
};

/**
 * Assign lead
 * Body: { assignee_id }
 */
const assignLead = async (req, res) => {
  try {
    const { id } = req.params; // lead_id
    const { assignee_id } = req.body;

    const lead = await Lead.findByPk(id);
    if (!lead) return resError(res, "Lead not found", 404);

    const user = await User.findByPk(assignee_id);
    if (!user) return resError(res, "Assignee not found", 404);

    const assignment = await LeadAssignment.create({
      lead_id: id,
      assignee_id,
      assigned_by: req.user.id,
    });

    return resSuccess(res, assignment, 201);
  } catch (err) {
    console.error("AssignLead Error:", err);
    return resError(res, "Internal server error", 500);
  }
};

/**
 * Get assignment history for a lead
 */
const getLeadAssignments = async (req, res) => {
  try {
    const { id } = req.params;

    const lead = await Lead.findByPk(id);
    if (!lead) return resError(res, "Lead not found", 404);

    const assignments = await LeadAssignment.findAll({
      where: { lead_id: id },
      include: [
        { model: User, as: "assignee", attributes: ["id", "full_name", "email"] },
        { model: User, as: "assigner", attributes: ["id", "full_name", "email"] },
      ],
      order: [["assigned_at", "DESC"]],
    });

    return resSuccess(res, assignments);
  } catch (err) {
    console.error("GetLeadAssignments Error:", err);
    return resError(res, "Internal server error", 500);
  }
};

// =============================
// Exports
// =============================
module.exports = {
  createLead,
  getLeads,
  getLeadById,
  updateLead,
  deleteLead,
  assignLead,
  getLeadAssignments,
};
