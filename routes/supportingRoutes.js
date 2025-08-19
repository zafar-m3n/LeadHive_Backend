const express = require("express");
const {
  getRoles,
  getLeadStatuses,
  getLeadSources,
  getManagers,
  getTeamMembers,
  getUnassignedSalesReps,
  getManagersAndAdmins,
  getAssignableUsersForManager,
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
router.get("/leads/statuses", authMiddleware, roleMiddleware(["admin", "manager", "sales_rep"]), getLeadStatuses);

// ✅ Get all lead sources (Admin, Manager, Sales Rep)
router.get("/leads/sources", authMiddleware, roleMiddleware(["admin", "manager", "sales_rep"]), getLeadSources);

// ✅ Get all managers (Admin only)
router.get("/users/managers", authMiddleware, roleMiddleware(["admin"]), getManagers);

// ✅ Get all managers & admins (Admin only)
router.get("/users/managers-admins", authMiddleware, roleMiddleware(["admin"]), getManagersAndAdmins);

// ✅ Get team members by teamId (Admin and Manager only)
router.get("/teams/:teamId/members", authMiddleware, roleMiddleware(["admin", "manager"]), getTeamMembers);

// ✅ Get unassigned active sales reps (Admin and Manager only)
router.get("/users/sales/unassigned", authMiddleware, roleMiddleware(["admin", "manager"]), getUnassignedSalesReps);

// ✅ Get assignable users for a manager (Admin and Manager only)
router.get("/users/assignable", authMiddleware, roleMiddleware(["admin", "manager"]), getAssignableUsersForManager);

module.exports = router;
