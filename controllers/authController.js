const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt"); 
const User = require("../models/User");
const Role = require("../models/Role");
const { resSuccess, resError } = require("../utils/responseUtil");

// ==============================
// Helper: Generate JWT Token
// ==============================
const generateToken = (user) => {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.Role.value },
    process.env.NODE_LEADHIVE_JWT_SECRET,
    { expiresIn: "7d" }
  );
};

// ==============================
// @desc   Register User
// @route  POST /api/v1/auth/register
// ==============================
const register = async (req, res) => {
  try {
    const { full_name, email, password, phone, avatar_url } = req.validatedData;

    // check if user exists
    const existingUser = await User.findOne({ where: { email } });
    if (existingUser) return resError(res, "User already exists", 400);

    // hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // assign default role = sales_rep
    const defaultRole = await Role.findOne({ where: { value: "sales_rep" } });
    if (!defaultRole) return resError(res, "Default role not found", 500);

    const newUser = await User.create({
      full_name,
      email,
      password_hash: hashedPassword,
      phone,
      avatar_url,
      role_id: defaultRole.id,
    });

    return resSuccess(
      res,
      {
        token: generateToken({ ...newUser.dataValues, Role: defaultRole }),
        user: {
          id: newUser.id,
          full_name: newUser.full_name,
          email: newUser.email,
          phone: newUser.phone,
          avatar_url: newUser.avatar_url,
          role: defaultRole.value,
        },
      },
      201
    );
  } catch (err) {
    console.error("Register Error:", err);
    return resError(res, "Server error during registration");
  }
};

// ==============================
// @desc   Login User
// @route  POST /api/v1/auth/login
// ==============================
const login = async (req, res) => {
  try {
    const { email, password } = req.validatedData;

    const user = await User.findOne({
      where: { email },
      include: [{ model: Role, attributes: ["id", "value", "label"] }],
    });

    if (!user) return resError(res, "Invalid credentials", 401);

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) return resError(res, "Invalid credentials", 401);

    return resSuccess(res, {
      token: generateToken(user),
      user: {
        id: user.id,
        full_name: user.full_name,
        email: user.email,
        phone: user.phone,
        avatar_url: user.avatar_url,
        role: user.Role.value,
      },
    });
  } catch (err) {
    console.error("Login Error:", err);
    return resError(res, "Server error during login");
  }
};

// ==============================
// @desc   Change Password
// @route  POST /api/v1/auth/change-password
// ==============================
const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.validatedData;

    const user = await User.findByPk(req.user.id);
    if (!user) return resError(res, "User not found", 404);

    const isMatch = await bcrypt.compare(currentPassword, user.password_hash);
    if (!isMatch) return resError(res, "Current password is incorrect", 400);

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    user.password_hash = hashedPassword;
    await user.save();

    return resSuccess(res, { message: "Password updated successfully" });
  } catch (err) {
    console.error("Change Password Error:", err);
    return resError(res, "Server error during password change");
  }
};

module.exports = {
  register,
  login,
  changePassword,
};
