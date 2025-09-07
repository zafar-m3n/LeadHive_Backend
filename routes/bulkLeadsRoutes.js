// routes/bulkLeadsRoutes.js
const express = require("express");
const router = express.Router();

const { bulkAssign, getAssignableTargets, bulkDeleteLeads } = require("../controllers/bulkLeadsController");

const authMiddleware = require("../middlewares/authMiddleware");
const roleMiddleware = require("../middlewares/roleMiddleware");

// All routes require authentication
router.use(authMiddleware);

/**
 * =============================
 * Bulk Lead Assignment
 * =============================
 */

// POST /api/v1/bulk-leads/assign
// Admin → Managers, Manager → Sales Reps
router.post("/assign", roleMiddleware(["admin", "manager"]), bulkAssign);

// GET /api/v1/bulk-leads/assignable-targets
// Returns valid assignable users depending on role
router.get("/targets", roleMiddleware(["admin", "manager"]), getAssignableTargets);

//DELETE /api/v1/bulk-leads/delete
router.delete("/delete", roleMiddleware(["admin", "manager"]), bulkDeleteLeads);

module.exports = router;
