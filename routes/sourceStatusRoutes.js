// routes/sourceStatusRoutes.js
const express = require("express");
const {
  // Lead Sources
  listLeadSources,
  getLeadSource,
  createLeadSource,
  updateLeadSource,
  deleteLeadSource,
  // Lead Statuses
  listLeadStatuses,
  getLeadStatus,
  createLeadStatus,
  updateLeadStatus,
  deleteLeadStatus,
} = require("../controllers/sourceStatusController");
const authMiddleware = require("../middlewares/authMiddleware");
const roleMiddleware = require("../middlewares/roleMiddleware");

const router = express.Router();

// ==============================
// Lead Sources Routes (Admin only)
// ==============================

// ✅ List/search/paginate lead sources
router.get("/lead/sources", authMiddleware, roleMiddleware(["admin"]), listLeadSources);

// ✅ Get single lead source by id
router.get("/lead/sources/:id", authMiddleware, roleMiddleware(["admin"]), getLeadSource);

// ✅ Create lead source
router.post("/lead/sources", authMiddleware, roleMiddleware(["admin"]), createLeadSource);

// ✅ Update lead source
router.put("/lead/sources/:id", authMiddleware, roleMiddleware(["admin"]), updateLeadSource);

// ✅ Delete lead source (blocked if in use)
router.delete("/lead/sources/:id", authMiddleware, roleMiddleware(["admin"]), deleteLeadSource);

// ==============================
// Lead Statuses Routes (Admin only)
// ==============================

// ✅ List/search/paginate lead statuses
router.get("/lead/statuses", authMiddleware, roleMiddleware(["admin"]), listLeadStatuses);

// ✅ Get single lead status by id
router.get("/lead/statuses/:id", authMiddleware, roleMiddleware(["admin"]), getLeadStatus);

// ✅ Create lead status
router.post("/lead/statuses", authMiddleware, roleMiddleware(["admin"]), createLeadStatus);

// ✅ Update lead status
router.put("/lead/statuses/:id", authMiddleware, roleMiddleware(["admin"]), updateLeadStatus);

// ✅ Delete lead status (blocked if in use)
router.delete("/lead/statuses/:id", authMiddleware, roleMiddleware(["admin"]), deleteLeadStatus);

module.exports = router;
