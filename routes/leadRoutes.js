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

const authMiddleware = require("../middlewares/authMiddleware");
const roleMiddleware = require("../middlewares/roleMiddleware");

const router = express.Router();


// ✅ Get all leads
router.get("/", authMiddleware, getLeads);

// ✅ Get a single lead by ID
router.get("/:id", authMiddleware, getLeadById);

// ✅ Create a new lead
router.post("/", authMiddleware, roleMiddleware(["manager", "admin"]), createLead);

// ✅ Update a lead by ID
router.put("/:id", authMiddleware, updateLead);

// ✅ Delete a lead by ID (only admins)
router.delete("/:id", authMiddleware, roleMiddleware(["admin"]), deleteLead);

// ✅ Assign a lead to a user (only managers/admins)
router.post("/:id/assign", authMiddleware, roleMiddleware(["manager", "admin"]), assignLead);

// ✅ Bulk import leads from frontend-processed CSV (only admins)
router.post("/import", authMiddleware, roleMiddleware(["admin"]), importLeads);

module.exports = router;
