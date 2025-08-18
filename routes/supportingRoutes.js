// routes/supportingRoutes.js
const express = require("express");
const {
  getRoles,
  getLeadStatuses,
  getLeadSources,
  getManagers,
  getTeamMembers,
} = require("../controllers/supportingController");

const authMiddleware = require("../middlewares/authMiddleware");
const roleMiddleware = require("../middlewares/roleMiddleware");

const router = express.Router();

// ==============================
// Supporting Data Routes
// ==============================

// ✅ Get all roles (Admin only)
router.get("/roles", authMiddleware, roleMiddleware(["admin"]), getRoles);

// ✅ Get all lead statuses (Admin, Manager, Sales Rep)
router.get("/lead-statuses", authMiddleware, roleMiddleware(["admin", "manager", "sales_rep"]), getLeadStatuses);

// ✅ Get all lead sources (Admin, Manager, Sales Rep)
router.get("/lead-sources", authMiddleware, roleMiddleware(["admin", "manager", "sales_rep"]), getLeadSources);

// ✅ Get all managers (Admin only)
router.get("/managers", authMiddleware, roleMiddleware(["admin"]), getManagers);

// ✅ Get team members by teamId (Admin and Manager only)
router.get("/team-members/:teamId", authMiddleware, roleMiddleware(["admin", "manager"]), getTeamMembers);

module.exports = router;
