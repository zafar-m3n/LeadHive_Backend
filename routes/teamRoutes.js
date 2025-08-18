// routes/teamRoutes.js
const express = require("express");
const router = express.Router();

const {
  createTeam,
  getTeams,
  getTeamById,
  updateTeam,
  deleteTeam,
  addMemberToTeam,
  removeMemberFromTeam,
} = require("../controllers/teamController");

const authMiddleware = require("../middlewares/authMiddleware");
const roleMiddleware = require("../middlewares/roleMiddleware");

// All routes require authentication
router.use(authMiddleware);

/**
 * =============================
 * Admin-only routes
 * =============================
 */
router.post("/", roleMiddleware(["admin"]), createTeam); // Create team
router.put("/:id", roleMiddleware(["admin"]), updateTeam); // Update team
router.delete("/:id", roleMiddleware(["admin"]), deleteTeam); // Delete team
router.post("/:id/members", roleMiddleware(["admin"]), addMemberToTeam); // Add member

/**
 * =============================
 * Admin & Manager routes
 * =============================
 */
router.get("/", roleMiddleware(["admin", "manager"]), getTeams); // Get all teams (admins) or only manager's team (filter in controller if needed)
router.get("/:id", roleMiddleware(["admin", "manager"]), getTeamById); // Get team by ID
router.delete("/:id/members/:userId", roleMiddleware(["admin", "manager"]), removeMemberFromTeam); // Remove member

module.exports = router;
