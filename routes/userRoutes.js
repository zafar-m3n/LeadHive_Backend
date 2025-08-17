// routes/userRoutes.js
const express = require("express");
const router = express.Router();

const userController = require("../controllers/userController");
const authMiddleware = require("../middlewares/authMiddleware");
const roleMiddleware = require("../middlewares/roleMiddleware");
const validateMiddleware = require("../middlewares/validateMiddleware");

const { updateProfileSchema, toggleActiveSchema, updatePasswordSchema } = require("../schemas/userSchemas");

// ==============================
// User Routes
// ==============================

// @route   GET /api/v1/users
// @desc    Get all users
// @access  Admin / Manager
router.get("/", authMiddleware, roleMiddleware(["admin", "manager"]), userController.getAllUsers);

// @route   GET /api/v1/users/:id
// @desc    Get single user by ID (self, admin, or manager)
// @access  Admin / Manager / Self
router.get("/:id", authMiddleware, userController.getUserById);

// @route   PUT /api/v1/users/:id
// @desc    Update profile
// @access  Admin / Manager / Self
router.put("/:id", authMiddleware, validateMiddleware(updateProfileSchema), userController.updateProfile);

// @route   PUT /api/v1/users/:id/password
// @desc    Update user password
// @access  Admin / Manager / Self
router.put("/:id/password", authMiddleware, validateMiddleware(updatePasswordSchema), userController.updatePassword);

// @route   PATCH /api/v1/users/:id/active
// @desc    Toggle user active/inactive
// @access  Admin / Manager
router.patch(
  "/:id/active",
  authMiddleware,
  roleMiddleware(["admin", "manager"]),
  validateMiddleware(toggleActiveSchema),
  userController.toggleActive
);

module.exports = router;
