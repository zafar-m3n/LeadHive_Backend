// controllers/leadsController.js
const { Lead, LeadStatus, LeadSource, User, LeadAssignment } = require("../models");
const { createLeadSchema, updateLeadSchema, assignLeadSchema } = require("../schemas/leadSchemas");
const { resSuccess, resError } = require("../utils/responseUtil");

// ==============================
// Create a Lead
// ==============================
const createLead = async (req, res) => {
  try {
    const parsed = createLeadSchema.parse(req.body);

    const lead = await Lead.create({
      ...parsed,
      created_by: req.user.id,
      updated_by: req.user.id,
    });

    return resSuccess(res, lead, "Lead created successfully", 201);
  } catch (err) {
    return resError(res, err.message);
  }
};

// ==============================
// Get All Leads
// ==============================
const getLeads = async (req, res) => {
  try {
    const leads = await Lead.findAll({
      include: [
        { model: LeadStatus, attributes: ["id", "label", "value"] },
        { model: LeadSource, attributes: ["id", "label", "value"] },
        { model: User, as: "creator", attributes: ["id", "full_name", "email"] },
        { model: User, as: "updater", attributes: ["id", "full_name", "email"] },
      ],
      order: [["created_at", "DESC"]],
    });

    return resSuccess(res, leads, "Leads fetched successfully");
  } catch (err) {
    return resError(res, err.message);
  }
};

// ==============================
// Get Lead by ID
// ==============================
const getLeadById = async (req, res) => {
  try {
    const { id } = req.params;

    const lead = await Lead.findByPk(id, {
      include: [
        { model: LeadStatus, attributes: ["id", "label", "value"] },
        { model: LeadSource, attributes: ["id", "label", "value"] },
        { model: User, as: "creator", attributes: ["id", "full_name", "email"] },
        { model: User, as: "updater", attributes: ["id", "full_name", "email"] },
      ],
    });

    if (!lead) return resError(res, "Lead not found", 404);

    return resSuccess(res, lead, "Lead fetched successfully");
  } catch (err) {
    return resError(res, err.message);
  }
};

// ==============================
// Update a Lead
// ==============================
const updateLead = async (req, res) => {
  try {
    const { id } = req.params;
    const parsed = updateLeadSchema.parse(req.body);

    const lead = await Lead.findByPk(id);
    if (!lead) return resError(res, "Lead not found", 404);

    await lead.update({ ...parsed, updated_by: req.user.id });

    return resSuccess(res, lead, "Lead updated successfully");
  } catch (err) {
    return resError(res, err.message);
  }
};

// ==============================
// Delete a Lead
// ==============================
const deleteLead = async (req, res) => {
  try {
    const { id } = req.params;

    const lead = await Lead.findByPk(id);
    if (!lead) return resError(res, "Lead not found", 404);

    await lead.destroy();
    return resSuccess(res, null, "Lead deleted successfully");
  } catch (err) {
    return resError(res, err.message);
  }
};

// ==============================
// Assign a Lead
// ==============================
const assignLead = async (req, res) => {
  try {
    const { id } = req.params;
    const parsed = assignLeadSchema.parse(req.body);

    const lead = await Lead.findByPk(id);
    if (!lead) return resError(res, "Lead not found", 404);

    const assignment = await LeadAssignment.create({
      lead_id: lead.id,
      assignee_id: parsed.assignee_id,
      assigned_by: req.user.id,
    });

    return resSuccess(res, assignment, "Lead assigned successfully", 201);
  } catch (err) {
    return resError(res, err.message);
  }
};

// ==============================
// Import Leads (CSV -> frontend sends JSON)
// ==============================
const importLeads = async (req, res) => {
  try {
    const { leads } = req.body; // array of leads from frontend
    if (!Array.isArray(leads) || leads.length === 0) {
      return resError(res, "No leads provided", 400);
    }

    const createdLeads = await Lead.bulkCreate(
      leads.map((l) => ({
        ...l,
        created_by: req.user.id,
        updated_by: req.user.id,
      }))
    );

    return resSuccess(res, createdLeads, "Leads imported successfully", 201);
  } catch (err) {
    return resError(res, err.message);
  }
};

// ==============================
// Exports
// ==============================
module.exports = {
  createLead,
  getLeads,
  getLeadById,
  updateLead,
  deleteLead,
  assignLead,
  importLeads,
};
