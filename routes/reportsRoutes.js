const express = require("express");
const router = express.Router();
const authMiddleware = require("../middlewares/authMiddleware");
const roleMiddleware = require("../middlewares/roleMiddleware");
const { getMonthlyReports } = require("../controllers/reportsController");

router.get("/monthly", authMiddleware, roleMiddleware(["admin", "manager"]), getMonthlyReports);

module.exports = router;
