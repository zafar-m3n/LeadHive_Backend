// routes/leadsExportRoutes.js
const express = require("express");
const router = express.Router();

const authMiddleware = require("../middlewares/authMiddleware");
const roleMiddleware = require("../middlewares/roleMiddleware");
const { exportCount, exportDownload } = require("../controllers/leadsExportController");

// Only admins/managers export; tweak if needed
router.post("/count", authMiddleware, roleMiddleware(["admin"]), exportCount);
router.post("/download", authMiddleware, roleMiddleware(["admin"]), exportDownload);

module.exports = router;
