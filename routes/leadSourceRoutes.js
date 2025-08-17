const express = require("express");
const router = express.Router();

const {
  createLeadSource,
  getLeadSources,
  updateLeadSource,
  deleteLeadSource,
} = require("../controllers/leadSourceController");

const validate = require("../middlewares/validateMiddleware");
const authMiddleware = require("../middlewares/authMiddleware");
const roleMiddleware = require("../middlewares/roleMiddleware");

const { createLeadSourceSchema, updateLeadSourceSchema } = require("../schemas/sourceAndStatusSchemas");

// Routes
router.post("/", authMiddleware, roleMiddleware(["admin"]), validate(createLeadSourceSchema), createLeadSource);

router.get("/", authMiddleware, getLeadSources);

router.put("/:id", authMiddleware, roleMiddleware(["admin"]), validate(updateLeadSourceSchema), updateLeadSource);

router.delete("/:id", authMiddleware, roleMiddleware(["admin"]), deleteLeadSource);

module.exports = router;
