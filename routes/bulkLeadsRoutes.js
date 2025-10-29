const express = require("express");
const router = express.Router();

const {
  bulkAssign,
  getAssignableTargets,
  bulkDeleteLeads,
  bulkUpdateStatus,
  bulkUpdateSource,
} = require("../controllers/bulkLeadsController");

const authMiddleware = require("../middlewares/authMiddleware");
const roleMiddleware = require("../middlewares/roleMiddleware");

// All routes require authentication
router.use(authMiddleware);

router.post("/assign", roleMiddleware(["admin", "manager"]), bulkAssign);
router.get("/targets", roleMiddleware(["admin", "manager"]), getAssignableTargets);
router.delete("/delete", roleMiddleware(["admin", "manager"]), bulkDeleteLeads);
router.post("/status", roleMiddleware(["admin", "manager"]), bulkUpdateStatus);
router.post("/source", roleMiddleware(["admin", "manager"]), bulkUpdateSource);

module.exports = router;
