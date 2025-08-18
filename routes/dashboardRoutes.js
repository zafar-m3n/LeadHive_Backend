const express = require("express");
const { getSummaryStats, getMyAssignments } = require("../controllers/dashboardController");
const authMiddleware = require("../middlewares/authMiddleware");
const roleMiddleware = require("../middlewares/roleMiddleware");

const router = express.Router();

// ==============================
// Dashboard Routes
// ==============================

// ✅ Summary stats for admin/manager/sales_rep
router.get("/summary", authMiddleware, roleMiddleware(["admin", "manager", "sales_rep"]), getSummaryStats);

// ✅ Leads assigned to current user (sales rep or manager)
router.get("/assignments", authMiddleware, roleMiddleware(["manager", "sales_rep"]), getMyAssignments);

module.exports = router;
