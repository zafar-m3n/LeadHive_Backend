const { z } = require("zod");

// ==============================
// 1) Create Team Schema
// ==============================
const createTeamSchema = z.object({
  name: z.string().min(2, "Team name must be at least 2 characters"),
  manager_id: z.number().int().min(1, "Invalid manager ID"),
});

// ==============================
// 2) Add Team Member Schema
// ==============================
const addTeamMemberSchema = z.object({
  user_id: z.number().int().min(1, "Invalid user ID"),
});

// ==============================
// 3) Update Team Schema (optional)
// ==============================
const updateTeamSchema = z.object({
  name: z.string().min(2, "Team name must be at least 2 characters").optional(),
  manager_id: z.number().int().min(1, "Invalid manager ID").optional(),
});

module.exports = {
  createTeamSchema,
  addTeamMemberSchema,
  updateTeamSchema,
};
