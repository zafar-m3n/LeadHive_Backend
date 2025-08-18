const express = require("express");
const { importLeads, getTemplateSchema } = require("../controllers/leadsUploadController");
const authMiddleware = require("../middlewares/authMiddleware");
const roleMiddleware = require("../middlewares/roleMiddleware");

const router = express.Router();

// ==============================
// Lead Upload Routes
// ==============================

// ✅ Get the expected schema/template (Admin only)
router.get("/template", authMiddleware, roleMiddleware(["admin"]), getTemplateSchema);

// ✅ Import leads in bulk (Admin only)
router.post("/import", authMiddleware, roleMiddleware(["admin"]), importLeads);

module.exports = router;
