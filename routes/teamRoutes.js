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

// ==============================
// Team Routes
// ==============================

// All routes require authentication
router.use(authMiddleware);

/**
 * =============================
 * Admin-only routes
 * =============================
 */

// ✅ Create a new team (with optional members)
router.post("/", roleMiddleware(["admin"]), createTeam);

// ✅ Update team details (name, manager, members)
router.put("/:id", roleMiddleware(["admin"]), updateTeam);

// ✅ Delete a team (removes members first, then team)
router.delete("/:id", roleMiddleware(["admin"]), deleteTeam);

// ✅ Add a member to team
router.post("/:id/members", roleMiddleware(["admin"]), addMemberToTeam);

/**
 * =============================
 * Admin & Manager routes
 * =============================
 */

// ✅ Get all teams (paginated)
router.get("/", roleMiddleware(["admin", "manager"]), getTeams);

// ✅ Get team by ID
router.get("/:id", roleMiddleware(["admin", "manager"]), getTeamById);

// ✅ Remove a member from a team
router.delete("/:id/members/:userId", roleMiddleware(["admin", "manager"]), removeMemberFromTeam);

module.exports = router;
