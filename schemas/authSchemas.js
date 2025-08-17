const { z } = require("zod");

// ==============================
// 1) Login Schema
// ==============================
const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

// ==============================
// 2) Register Schema
// ==============================
const registerSchema = z.object({
  full_name: z.string().min(2, "Full name is too short"),
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  phone: z.string().optional(),
  avatar_url: z.string().url("Invalid URL").optional(),
});

// ==============================
// 3) Change Password Schema
// ==============================
const changePasswordSchema = z.object({
  currentPassword: z.string().min(6, "Current password must be at least 6 characters"),
  newPassword: z.string().min(6, "New password must be at least 6 characters"),
});

module.exports = {
  loginSchema,
  registerSchema,
  changePasswordSchema,
};
