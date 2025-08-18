// controllers/savedFilterController.js
const { SavedFilter, User } = require("../models");
const { Op } = require("sequelize");

// ==============================
// Create a Saved Filter
// ==============================
const createSavedFilter = async (req, res) => {
  try {
    const { name, definition_json, is_shared = false } = req.body;

    if (!name || !definition_json) {
      return res.status(400).json({
        success: false,
        error: "Name and definition_json are required.",
      });
    }

    const savedFilter = await SavedFilter.create({
      user_id: req.user.id,
      name,
      definition_json,
      is_shared,
    });

    return res.status(201).json({ success: true, data: savedFilter });
  } catch (err) {
    console.error("Error creating saved filter:", err);
    return res.status(500).json({
      success: false,
      error: "Server error while creating saved filter.",
    });
  }
};

// ==============================
// Get All Saved Filters (mine + shared)
// ==============================
const getSavedFilters = async (req, res) => {
  try {
    const filters = await SavedFilter.findAll({
      where: {
        [Op.or]: [{ user_id: req.user.id }, { is_shared: true }],
      },
      include: [{ model: User, attributes: ["id", "full_name", "email"] }],
      order: [["created_at", "DESC"]],
    });

    return res.status(200).json({ success: true, data: filters });
  } catch (err) {
    console.error("Error fetching saved filters:", err);
    return res.status(500).json({
      success: false,
      error: "Server error while fetching saved filters.",
    });
  }
};

// ==============================
// Get Single Saved Filter
// ==============================
const getSavedFilterById = async (req, res) => {
  try {
    const { id } = req.params;

    const filter = await SavedFilter.findByPk(id, {
      include: [{ model: User, attributes: ["id", "full_name", "email"] }],
    });

    if (!filter) {
      return res.status(404).json({
        success: false,
        error: "Saved filter not found.",
      });
    }

    // Access control: must be owner or shared
    if (filter.user_id !== req.user.id && !filter.is_shared) {
      return res.status(403).json({
        success: false,
        error: "You do not have access to this filter.",
      });
    }

    return res.status(200).json({ success: true, data: filter });
  } catch (err) {
    console.error("Error fetching saved filter:", err);
    return res.status(500).json({
      success: false,
      error: "Server error while fetching saved filter.",
    });
  }
};

// ==============================
// Update Saved Filter
// ==============================
const updateSavedFilter = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, definition_json, is_shared } = req.body;

    const filter = await SavedFilter.findByPk(id);

    if (!filter) {
      return res.status(404).json({
        success: false,
        error: "Saved filter not found.",
      });
    }

    if (filter.user_id !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: "You can only update your own filters.",
      });
    }

    filter.name = name || filter.name;
    filter.definition_json = definition_json || filter.definition_json;
    if (typeof is_shared === "boolean") {
      filter.is_shared = is_shared;
    }
    filter.updated_at = new Date();

    await filter.save();

    return res.status(200).json({ success: true, data: filter });
  } catch (err) {
    console.error("Error updating saved filter:", err);
    return res.status(500).json({
      success: false,
      error: "Server error while updating saved filter.",
    });
  }
};

// ==============================
// Delete Saved Filter
// ==============================
const deleteSavedFilter = async (req, res) => {
  try {
    const { id } = req.params;

    const filter = await SavedFilter.findByPk(id);

    if (!filter) {
      return res.status(404).json({
        success: false,
        error: "Saved filter not found.",
      });
    }

    if (filter.user_id !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: "You can only delete your own filters.",
      });
    }

    await filter.destroy();

    return res.status(200).json({ success: true, message: "Saved filter deleted successfully." });
  } catch (err) {
    console.error("Error deleting saved filter:", err);
    return res.status(500).json({
      success: false,
      error: "Server error while deleting saved filter.",
    });
  }
};

// ==============================
// Exports
// ==============================
module.exports = {
  createSavedFilter,
  getSavedFilters,
  getSavedFilterById,
  updateSavedFilter,
  deleteSavedFilter,
};
