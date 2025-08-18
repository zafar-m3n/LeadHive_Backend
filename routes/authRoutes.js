// routes/authRoutes.js
const express = require("express");
const router = express.Router();

const { register, login, getProfile, updatePassword } = require("../controllers/authController");
const authMiddleware = require("../middlewares/authMiddleware");

// =============================
// Public routes
// =============================
router.post("/register", register);
router.post("/login", login);

// =============================
// Protected routes
// =============================
router.get("/profile", authMiddleware, getProfile);
router.patch("/update-password", authMiddleware, updatePassword);

module.exports = router;
