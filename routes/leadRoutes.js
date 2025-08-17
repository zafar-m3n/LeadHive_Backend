// routes/leadRoutes.js
const express = require("express");
const {
  createLead,
  getLeads,
  getLeadById,
  updateLead,
  deleteLead,
  assignLead,
  importLeads,
} = require("../controllers/leadController");

const router = express.Router();

// ==============================
// Lead Routes
// ==============================

// ✅ Get all leads
router.get("/", getLeads);

// ✅ Get a single lead by ID
router.get("/:id", getLeadById);

// ✅ Create a new lead
router.post("/", createLead);

// ✅ Update a lead by ID
router.put("/:id", updateLead);

// ✅ Delete a lead by ID
router.delete("/:id", deleteLead);

// ✅ Assign a lead to a user
router.post("/:id/assign", assignLead);

// ✅ Bulk import leads from frontend-processed CSV
router.post("/import", importLeads);

module.exports = router;
