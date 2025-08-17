const { LeadSource } = require("../models");
const { resSuccess, resError } = require("../utils/responseUtil");

// ==============================
// Create Lead Source
// ==============================
const createLeadSource = async (req, res) => {
  try {
    const { value, label } = req.validatedData;
    const source = await LeadSource.create({ value, label });
    return resSuccess(res, source, "Lead source created successfully");
  } catch (err) {
    console.error("Create LeadSource Error:", err);
    return resError(res, "Failed to create lead source");
  }
};

// ==============================
// Get All Lead Sources
// ==============================
const getLeadSources = async (req, res) => {
  try {
    const sources = await LeadSource.findAll({ order: [["id", "ASC"]] });
    return resSuccess(res, sources);
  } catch (err) {
    console.error("Get LeadSources Error:", err);
    return resError(res, "Failed to fetch lead sources");
  }
};

// ==============================
// Update Lead Source
// ==============================
const updateLeadSource = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.validatedData;

    const source = await LeadSource.findByPk(id);
    if (!source) return resError(res, "Lead source not found", 404);

    await source.update(updates);
    return resSuccess(res, source, "Lead source updated successfully");
  } catch (err) {
    console.error("Update LeadSource Error:", err);
    return resError(res, "Failed to update lead source");
  }
};

// ==============================
// Delete Lead Source
// ==============================
const deleteLeadSource = async (req, res) => {
  try {
    const { id } = req.params;
    const source = await LeadSource.findByPk(id);
    if (!source) return resError(res, "Lead source not found", 404);

    await source.destroy();
    return resSuccess(res, null, "Lead source deleted successfully");
  } catch (err) {
    console.error("Delete LeadSource Error:", err);
    return resError(res, "Failed to delete lead source");
  }
};

module.exports = {
  createLeadSource,
  getLeadSources,
  updateLeadSource,
  deleteLeadSource,
};
