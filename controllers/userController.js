// controllers/userController.js
const bcrypt = require("bcrypt");
const { User, Role } = require("../models");
const { resSuccess, resError } = require("../utils/responseUtil");

const BCRYPT_ROUNDS = parseInt(process.env.NODE_LEADHIVE_BCRYPT_SALT_ROUNDS || "10", 10);

// Utility to strip sensitive fields
const sanitizeUser = (user) => {
  const plain = user.toJSON();
  delete plain.password_hash;
  return plain;
};

/**
 * Create new user (admin only)
 * Body: { full_name, email, password, role_id, phone?, avatar_url? }
 */
const createUser = async (req, res) => {
  try {
    const { full_name, email, password, role_id, phone, avatar_url } = req.body;

    if (!full_name || !email || !password || !role_id) {
      return resError(res, "Missing required fields", 400);
    }

    const existing = await User.findOne({ where: { email } });
    if (existing) return resError(res, "Email already in use", 400);

    const role = await Role.findByPk(role_id);
    if (!role) return resError(res, "Invalid role_id", 400);

    const password_hash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    const user = await User.create({
      full_name,
      email,
      password_hash,
      role_id,
      phone: phone || null,
      avatar_url: avatar_url || null,
      is_active: true,
    });

    const created = await User.findByPk(user.id, {
      include: [{ model: Role, attributes: ["id", "value", "label"] }],
    });

    return resSuccess(res, sanitizeUser(created), 201);
  } catch (err) {
    console.error("CreateUser Error:", err);
    return resError(res, "Internal server error", 500);
  }
};

/**
 * Get all users (admin only)
 */
const getUsers = async (req, res) => {
  try {
    const users = await User.findAll({
      include: [{ model: Role, attributes: ["id", "value", "label"] }],
      order: [["id", "ASC"]],
    });

    const safe = users.map(sanitizeUser);
    return resSuccess(res, safe);
  } catch (err) {
    console.error("GetUsers Error:", err);
    return resError(res, "Internal server error", 500);
  }
};

/**
 * Get user by ID (admin only)
 */
const getUserById = async (req, res) => {
  try {
    const { id } = req.params;

    const user = await User.findByPk(id, {
      include: [{ model: Role, attributes: ["id", "value", "label"] }],
    });

    if (!user) return resError(res, "User not found", 404);

    return resSuccess(res, sanitizeUser(user));
  } catch (err) {
    console.error("GetUserById Error:", err);
    return resError(res, "Internal server error", 500);
  }
};

/**
 * Update user details (admin only)
 */
const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { full_name, email, phone, avatar_url, role_id, is_active } = req.body;

    const user = await User.findByPk(id);
    if (!user) return resError(res, "User not found", 404);

    if (full_name !== undefined) user.full_name = full_name;
    if (email !== undefined) user.email = email;
    if (phone !== undefined) user.phone = phone;
    if (avatar_url !== undefined) user.avatar_url = avatar_url;
    if (role_id !== undefined) user.role_id = role_id;
    if (is_active !== undefined) user.is_active = is_active;

    await user.save();

    const updated = await User.findByPk(id, {
      include: [{ model: Role, attributes: ["id", "value", "label"] }],
    });

    return resSuccess(res, sanitizeUser(updated));
  } catch (err) {
    console.error("UpdateUser Error:", err);
    return resError(res, "Internal server error", 500);
  }
};

/**
 * "Delete" user = deactivate (admin only)
 */
const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;

    const user = await User.findByPk(id);
    if (!user) return resError(res, "User not found", 404);

    user.is_active = false;
    await user.save();

    return resSuccess(res, { message: "User deactivated successfully" });
  } catch (err) {
    console.error("DeleteUser Error:", err);
    return resError(res, "Internal server error", 500);
  }
};

// =============================
// Exports
// =============================
module.exports = {
  createUser,
  getUsers,
  getUserById,
  updateUser,
  deleteUser,
};
