const express = require("express");
const router = express.Router();

const {
  createLeadStatus,
  getLeadStatuses,
  updateLeadStatus,
  deleteLeadStatus,
} = require("../controllers/leadStatusController");

const validate = require("../middlewares/validateMiddleware");
const authMiddleware = require("../middlewares/authMiddleware");
const roleMiddleware = require("../middlewares/roleMiddleware");

const { createLeadStatusSchema, updateLeadStatusSchema } = require("../schemas/sourceAndStatusSchemas");

// Routes
router.post("/", authMiddleware, roleMiddleware(["admin"]), validate(createLeadStatusSchema), createLeadStatus);

router.get("/", authMiddleware, getLeadStatuses);

router.put("/:id", authMiddleware, roleMiddleware(["admin"]), validate(updateLeadStatusSchema), updateLeadStatus);

router.delete("/:id", authMiddleware, roleMiddleware(["admin"]), deleteLeadStatus);

module.exports = router;
