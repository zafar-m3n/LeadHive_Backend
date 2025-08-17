const { z } = require("zod");

// ==============================
// 1) Update Profile Schema
// ==============================
const updateProfileSchema = z.object({
  full_name: z.string().min(2, "Full name is too short").optional(),
  phone: z.string().optional(),
  avatar_url: z.string().url("Invalid URL").optional(),
});

// ==============================
// 2) Toggle Active Schema
// ==============================
const toggleActiveSchema = z.object({
  is_active: z.boolean({
    required_error: "is_active field is required",
  }),
});

// ==============================
// 3) Update Password Schema (Optional here)
// ==============================
const updatePasswordSchema = z.object({
  newPassword: z.string().min(6, "Password must be at least 6 characters"),
});

module.exports = {
  updateProfileSchema,
  toggleActiveSchema,
  updatePasswordSchema,
};
