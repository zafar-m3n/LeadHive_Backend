const express = require("express");
const { register, login, changePassword } = require("../controllers/authController");
const validateMiddleware = require("../middlewares/validateMiddleware");
const authMiddleware = require("../middlewares/authMiddleware");
const { registerSchema, loginSchema, changePasswordSchema } = require("../schemas/authSchemas");

const router = express.Router();

// ==============================
// @route   POST /api/v1/auth/register
// @desc    Register new user
// ==============================
router.post("/register", validateMiddleware(registerSchema), register);

// ==============================
// @route   POST /api/v1/auth/login
// @desc    Login user
// ==============================
router.post("/login", validateMiddleware(loginSchema), login);

// ==============================
// @route   POST /api/v1/auth/change-password
// @desc    Change password (authenticated only)
// ==============================
router.post("/change-password", authMiddleware, validateMiddleware(changePasswordSchema), changePassword);

module.exports = router;
