// routes/savedFilterRoutes.js
const express = require("express");
const {
  createSavedFilter,
  getSavedFilters,
  getSavedFilterById,
  updateSavedFilter,
  deleteSavedFilter,
} = require("../controllers/savedFilterController");
const authMiddleware = require("../middlewares/authMiddleware");
const roleMiddleware = require("../middlewares/roleMiddleware");

const router = express.Router();

// ==============================
// Saved Filter Routes
// ==============================

// ✅ Create a new saved filter (all roles can create their own)
router.post("/", authMiddleware, roleMiddleware(["admin", "manager", "sales_rep"]), createSavedFilter);

// ✅ Get all filters (user’s own + shared)
router.get("/", authMiddleware, roleMiddleware(["admin", "manager", "sales_rep"]), getSavedFilters);

// ✅ Get a single filter by ID
router.get("/:id", authMiddleware, roleMiddleware(["admin", "manager", "sales_rep"]), getSavedFilterById);

// ✅ Update a filter
router.put("/:id", authMiddleware, roleMiddleware(["admin", "manager", "sales_rep"]), updateSavedFilter);

// ✅ Delete a filter
router.delete("/:id", authMiddleware, roleMiddleware(["admin", "manager", "sales_rep"]), deleteSavedFilter);

module.exports = router;
