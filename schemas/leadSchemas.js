const { z } = require("zod");

// ==============================
// 1) Create Lead Schema
// ==============================
const createLeadSchema = z.object({
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  company: z.string().optional(),
  email: z.string().email("Invalid email address").optional(),
  phone: z.string().optional(),
  country: z.string().optional(),
  status_id: z.number().int().min(1, "Invalid status").nonnegative(),
  source_id: z.number().int().min(1, "Invalid source").optional(),
  value_decimal: z.number().min(0, "Value must be >= 0").optional(),
  notes: z.string().optional(),
});

// ==============================
// 2) Update Lead Schema
// ==============================
const updateLeadSchema = z.object({
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  company: z.string().optional(),
  email: z.string().email("Invalid email address").optional(),
  phone: z.string().optional(),
  country: z.string().optional(),
  status_id: z.number().int().optional(),
  source_id: z.number().int().optional(),
  value_decimal: z.number().min(0, "Value must be >= 0").optional(),
  notes: z.string().optional(),
});

// ==============================
// 3) Assign Lead Schema
// ==============================
const assignLeadSchema = z.object({
  assignee_id: z.number().int().min(1, "Invalid user ID"),
});

module.exports = {
  createLeadSchema,
  updateLeadSchema,
  assignLeadSchema,
};
