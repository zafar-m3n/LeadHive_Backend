const express = require("express");
const router = express.Router();
const { register, login } = require("../controllers/authController");

// @route   POST /api/v1/auth/register
// @desc    Register a new user
router.post("/register", register);

// @route   POST /api/v1/auth/login
// @desc    Login a user
router.post("/login", login);

module.exports = router;
