const { z } = require("zod");

// ==============================
// 1) Create Filter Schema
// ==============================
const createFilterSchema = z.object({
  name: z.string().min(2, "Filter name must be at least 2 characters"),
  is_shared: z.boolean().optional(), 
  definition_json: z.record(z.any()),
});

// ==============================
// 2) Update Filter Schema
// ==============================
const updateFilterSchema = z.object({
  name: z.string().min(2, "Filter name must be at least 2 characters").optional(),
  is_shared: z.boolean().optional(),
  definition_json: z.record(z.any()).optional(),
});

module.exports = {
  createFilterSchema,
  updateFilterSchema,
};
