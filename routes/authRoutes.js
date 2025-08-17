const express = require("express");
const { register, login, changePassword } = require("../controllers/authController");
const authMiddleware = require("../middlewares/authMiddleware");
const router = express.Router();

// ==============================
// @route   POST /api/v1/auth/register
// @desc    Register new user
// ==============================
router.post("/register", register);

// ==============================
// @route   POST /api/v1/auth/login
// @desc    Login user
// ==============================
router.post("/login", login);

// ==============================
// @route   POST /api/v1/auth/change-password
// @desc    Change password (authenticated only)
// ==============================
router.post("/password/change", authMiddleware, changePassword);

module.exports = router;
