const { z } = require("zod");

// ==============================
// Lead Status Schemas
// ==============================
const createLeadStatusSchema = z.object({
  value: z.string().min(2, "Status value is required"),
  label: z.string().min(2, "Status label is required"),
});

const updateLeadStatusSchema = z.object({
  value: z.string().min(2, "Status value is required").optional(),
  label: z.string().min(2, "Status label is required").optional(),
});

// ==============================
// Lead Source Schemas
// ==============================
const createLeadSourceSchema = z.object({
  value: z.string().min(2, "Source value is required"),
  label: z.string().min(2, "Source label is required"),
});

const updateLeadSourceSchema = z.object({
  value: z.string().min(2, "Source value is required").optional(),
  label: z.string().min(2, "Source label is required").optional(),
});

module.exports = {
  createLeadStatusSchema,
  updateLeadStatusSchema,
  createLeadSourceSchema,
  updateLeadSourceSchema,
};
