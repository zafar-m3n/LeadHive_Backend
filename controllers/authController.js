// controllers/authController.js
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
require("dotenv").config();

const { User, Role } = require("../models");
const { resSuccess, resError } = require("../utils/responseUtil");

const BCRYPT_ROUNDS = parseInt(process.env.NODE_LEADHIVE_BCRYPT_SALT_ROUNDS || "10", 10);
const JWT_SECRET = process.env.NODE_LEADHIVE_JWT_SECRET;

// =============================
// Helpers
// =============================
const generateToken = (user) => {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.Role ? user.Role.value : null,
    },
    JWT_SECRET,
    { expiresIn: "1d" } // 1 day only
  );
};

const sanitizeUser = (user) => {
  const plain = user.toJSON();
  delete plain.password_hash;
  return plain;
};

// =============================
// Controllers
// =============================

/**
 * Register new user
 * Body: { full_name, email, password, role_id, phone?, avatar_url? }
 * -> Creates account, DOES NOT auto-login
 */
const register = async (req, res) => {
  try {
    const { full_name, email, password, role_id, phone, avatar_url } = req.body;

    if (!full_name || !email || !password || !role_id) {
      return resError(res, "Missing required fields", 400);
    }

    const existing = await User.findOne({ where: { email } });
    if (existing) return resError(res, "Email already in use", 400);

    const password_hash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    const user = await User.create({
      full_name,
      email,
      password_hash,
      role_id,
      phone: phone || null,
      avatar_url: avatar_url || null,
    });

    return resSuccess(res, { message: "User registered successfully. Please log in." }, 201);
  } catch (err) {
    console.error("Register Error:", err);
    return resError(res, "Internal server error", 500);
  }
};

/**
 * Login user
 * Body: { email, password }
 * -> Generates JWT valid for 1 day
 */
const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return resError(res, "Missing email or password", 400);

    const user = await User.findOne({
      where: { email },
      include: [{ model: Role, attributes: ["id", "value", "label"] }],
    });
    if (!user) return resError(res, "Invalid credentials", 401);
    if (!user.is_active) return resError(res, "Account is deactivated", 403);

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) return resError(res, "Invalid credentials", 401);

    const token = generateToken(user);

    return resSuccess(res, { user: sanitizeUser(user), token });
  } catch (err) {
    console.error("Login Error:", err);
    return resError(res, "Internal server error", 500);
  }
};

/**
 * Get current user's profile
 * Auth: Bearer token
 */
const getProfile = async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id, {
      include: [{ model: Role, attributes: ["id", "value", "label"] }],
    });

    if (!user) return resError(res, "User not found", 404);

    return resSuccess(res, sanitizeUser(user));
  } catch (err) {
    console.error("GetProfile Error:", err);
    return resError(res, "Internal server error", 500);
  }
};

/**
 * Update password
 * Body: { current_password, new_password }
 */
const updatePassword = async (req, res) => {
  try {
    const { current_password, new_password } = req.body;
    if (!current_password || !new_password) {
      return resError(res, "Both current_password and new_password are required", 400);
    }

    const user = await User.findByPk(req.user.id);
    if (!user) return resError(res, "User not found", 404);

    const isMatch = await bcrypt.compare(current_password, user.password_hash);
    if (!isMatch) return resError(res, "Current password is incorrect", 401);

    const newHash = await bcrypt.hash(new_password, BCRYPT_ROUNDS);
    user.password_hash = newHash;
    await user.save();

    return resSuccess(res, { message: "Password updated successfully" });
  } catch (err) {
    console.error("UpdatePassword Error:", err);
    return resError(res, "Internal server error", 500);
  }
};

// =============================
// Exports
// =============================
module.exports = {
  register,
  login,
  getProfile,
  updatePassword,
};
