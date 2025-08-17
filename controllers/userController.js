// controllers/userController.js
const bcrypt = require("bcrypt");
const { User, Role } = require("../models");
const { resSuccess, resError } = require("../utils/responseUtil");

// ==============================
// @desc    Get all users (with roles)
// @route   GET /api/v1/users
// @access  Admin / Manager
// ==============================
const getAllUsers = async (req, res) => {
  try {
    const users = await User.findAll({
      attributes: { exclude: ["password_hash"] },
      include: [{ model: Role, attributes: ["id", "value", "label"] }],
      order: [["id", "ASC"]],
    });
    return resSuccess(res, users);
  } catch (err) {
    return resError(res, err.message, 500);
  }
};

// ==============================
// @desc    Get single user by ID
// @route   GET /api/v1/users/:id
// @access  Admin / Manager / (Self)
// ==============================
const getUserById = async (req, res) => {
  try {
    const { id } = req.params;

    // Allow self access or role-based access
    if (req.user.role !== "admin" && req.user.role !== "manager" && req.user.id !== parseInt(id)) {
      return resError(res, "Not authorized to view this user", 403);
    }

    const user = await User.findByPk(id, {
      attributes: { exclude: ["password_hash"] },
      include: [{ model: Role, attributes: ["id", "value", "label"] }],
    });

    if (!user) return resError(res, "User not found", 404);

    return resSuccess(res, user);
  } catch (err) {
    return resError(res, err.message, 500);
  }
};

// ==============================
// @desc    Update user profile
// @route   PUT /api/v1/users/:id
// @access  Admin / Manager / (Self)
// ==============================
const updateProfile = async (req, res) => {
  try {
    const { id } = req.params;

    // Allow self access or role-based access
    if (req.user.role !== "admin" && req.user.role !== "manager" && req.user.id !== parseInt(id)) {
      return resError(res, "Not authorized to update this user", 403);
    }

    const user = await User.findByPk(id);
    if (!user) return resError(res, "User not found", 404);

    const { full_name, phone, avatar_url } = req.body;
    user.full_name = full_name ?? user.full_name;
    user.phone = phone ?? user.phone;
    user.avatar_url = avatar_url ?? user.avatar_url;
    user.updated_at = new Date();

    await user.save();

    return resSuccess(res, {
      message: "Profile updated successfully",
      user: {
        id: user.id,
        full_name: user.full_name,
        email: user.email,
        phone: user.phone,
        avatar_url: user.avatar_url,
        is_active: user.is_active,
      },
    });
  } catch (err) {
    return resError(res, err.message, 500);
  }
};

// ==============================
// @desc    Update user password
// @route   PUT /api/v1/users/:id/password
// @access  Admin / Manager / (Self)
// ==============================
const updatePassword = async (req, res) => {
  try {
    const { id } = req.params;
    const { newPassword } = req.body;

    if (req.user.role !== "admin" && req.user.role !== "manager" && req.user.id !== parseInt(id)) {
      return resError(res, "Not authorized to update this user's password", 403);
    }

    const user = await User.findByPk(id);
    if (!user) return resError(res, "User not found", 404);

    const salt = await bcrypt.genSalt(10);
    user.password_hash = await bcrypt.hash(newPassword, salt);
    user.updated_at = new Date();

    await user.save();

    return resSuccess(res, { message: "Password updated successfully" });
  } catch (err) {
    return resError(res, err.message, 500);
  }
};

// ==============================
// @desc    Toggle user active state
// @route   PATCH /api/v1/users/:id/active
// @access  Admin / Manager
// ==============================
const toggleActive = async (req, res) => {
  try {
    const { id } = req.params;
    const { is_active } = req.body;

    if (req.user.role !== "admin" && req.user.role !== "manager") {
      return resError(res, "Not authorized to toggle user status", 403);
    }

    const user = await User.findByPk(id);
    if (!user) return resError(res, "User not found", 404);

    user.is_active = is_active;
    user.updated_at = new Date();

    await user.save();

    return resSuccess(res, {
      message: `User ${is_active ? "activated" : "deactivated"} successfully`,
      user: {
        id: user.id,
        full_name: user.full_name,
        email: user.email,
        is_active: user.is_active,
      },
    });
  } catch (err) {
    return resError(res, err.message, 500);
  }
};

module.exports = {
  getAllUsers,
  getUserById,
  updateProfile,
  updatePassword,
  toggleActive,
};
