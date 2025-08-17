const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { User } = require("../models");
const { resSuccess, resError } = require("../utils/responseUtil");
require("dotenv").config();

// ===========================
// REGISTER CONTROLLER
// ===========================
const register = async (req, res) => {
  try {
    const { full_name, email, password } = req.body;

    // Check if email already exists
    const existingUser = await User.findOne({ where: { email } });
    if (existingUser) {
      return resError(res, "Email already registered", 400);
    }

    // Hash password
    const salt = await bcrypt.genSalt(process.env.NODE_LEADHIVE_BCRYPT_SALT_ROUNDS);
    const password_hash = await bcrypt.hash(password, salt);

    // Create user
    const user = await User.create({
      full_name,
      email,
      password: password_hash,
    });

    return resSuccess(
      res,
      {
        message: "Registration successful. Please log in.",
        user: {
          id: user.id,
          full_name: user.full_name,
          email: user.email,
        },
      },
      201
    );
  } catch (err) {
    console.error(err);
    return resError(res, "Server error during registration", 500);
  }
};

// ===========================
// LOGIN CONTROLLER
// ===========================
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find user by email
    const user = await User.findOne({ where: { email } });
    if (!user) {
      return resError(res, "Invalid email or password", 401);
    }

    // Check password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return resError(res, "Invalid email or password", 401);
    }

    // Generate JWT
    const token = jwt.sign({ id: user.id }, process.env.NODE_LEADHIVE_JWT_SECRET, { expiresIn: "1d" });

    return resSuccess(res, {
      token,
      user: {
        id: user.id,
        full_name: user.full_name,
        email: user.email,
      },
    });
  } catch (err) {
    console.error(err);
    return resError(res, "Server error during login", 500);
  }
};

module.exports = {
  register,
  login,
};
