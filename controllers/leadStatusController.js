const { LeadStatus } = require("../models");
const { resSuccess, resError } = require("../utils/responseUtil");

// ==============================
// Create Lead Status
// ==============================
const createLeadStatus = async (req, res) => {
  try {
    const { value, label } = req.validatedData;
    const status = await LeadStatus.create({ value, label });
    return resSuccess(res, status, "Lead status created successfully");
  } catch (err) {
    console.error("Create LeadStatus Error:", err);
    return resError(res, "Failed to create lead status");
  }
};

// ==============================
// Get All Lead Statuses
// ==============================
const getLeadStatuses = async (req, res) => {
  try {
    const statuses = await LeadStatus.findAll({ order: [["id", "ASC"]] });
    return resSuccess(res, statuses);
  } catch (err) {
    console.error("Get LeadStatuses Error:", err);
    return resError(res, "Failed to fetch lead statuses");
  }
};

// ==============================
// Update Lead Status
// ==============================
const updateLeadStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.validatedData;

    const status = await LeadStatus.findByPk(id);
    if (!status) return resError(res, "Lead status not found", 404);

    await status.update(updates);
    return resSuccess(res, status, "Lead status updated successfully");
  } catch (err) {
    console.error("Update LeadStatus Error:", err);
    return resError(res, "Failed to update lead status");
  }
};

// ==============================
// Delete Lead Status
// ==============================
const deleteLeadStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const status = await LeadStatus.findByPk(id);
    if (!status) return resError(res, "Lead status not found", 404);

    await status.destroy();
    return resSuccess(res, null, "Lead status deleted successfully");
  } catch (err) {
    console.error("Delete LeadStatus Error:", err);
    return resError(res, "Failed to delete lead status");
  }
};

module.exports = {
  createLeadStatus,
  getLeadStatuses,
  updateLeadStatus,
  deleteLeadStatus,
};
