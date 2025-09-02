"use strict";

const { Op, literal } = require("sequelize");
const { Lead, LeadStatus, LeadSource, User, LeadAssignment } = require("../models");
const { resSuccess, resError } = require("../utils/responseUtil");

/** Subquery: latest LeadAssignment row id per lead */
const LATEST_ASSIGNMENT_IDS = literal(`(SELECT MAX(id) FROM lead_assignments GROUP BY lead_id)`);

/** Build include that joins ONLY the latest assignment per lead; optionally filter by assignee_id */
const buildLatestAssignmentInclude = (assigneeId = null) => {
  const where = { id: { [Op.in]: LATEST_ASSIGNMENT_IDS } };
  if (assigneeId) where.assignee_id = Number(assigneeId);

  return {
    model: LeadAssignment,
    as: "LeadAssignments",
    required: !!assigneeId, // require join only if scoping by assignee
    where,
    include: [
      {
        model: User,
        as: "assignee",
        attributes: ["id", "full_name", "email", "role_id"],
      },
    ],
  };
};

/**
 * Create a new lead
 * Body: { first_name?, last_name?, company?, email?, phone?, country?, status_id, source_id?, value_decimal?, notes? }
 */
const createLead = async (req, res) => {
  try {
    const { first_name, last_name, company, email, phone, country, status_id, source_id, value_decimal, notes } =
      req.body;

    if (!status_id) return resError(res, "status_id is required", 400);

    // 1) Create lead
    const lead = await Lead.create({
      first_name,
      last_name,
      company,
      email,
      phone,
      country,
      status_id,
      source_id,
      value_decimal: value_decimal ?? 0.0,
      notes,
      created_by: req.user.id,
    });

    // 2) Initial assignment to creator
    await LeadAssignment.create({
      lead_id: lead.id,
      assignee_id: req.user.id,
      assigned_by: req.user.id,
    });

    return resSuccess(res, lead, 201);
  } catch (err) {
    console.error("CreateLead Error:", err);
    return resError(res, "Internal server error", 500);
  }
};

/**
 * Get leads by role with optional filters, pagination, and search
 * - Admin/Manager: see all; optional filter by current assignee (latest assignment)
 * - Sales Rep: only leads whose latest assignment is the current user
 */
const getLeads = async (req, res) => {
  try {
    const { role, id: userId } = req.user;
    const { status_id, source_id, assignee_id, orderBy, orderDir, search, page = 1, limit = 10 } = req.query;

    const where = {};

    // Filters on Lead fields
    if (status_id) where.status_id = status_id;
    if (source_id) where.source_id = source_id;

    // Search
    if (search) {
      where[Op.or] = [
        { first_name: { [Op.like]: `%${search}%` } },
        { last_name: { [Op.like]: `%${search}%` } },
        { email: { [Op.like]: `%${search}%` } },
      ];
    }

    // Ordering
    let order = [["id", "ASC"]];
    if (orderBy) {
      const dir = (orderDir || "ASC").toUpperCase() === "DESC" ? "DESC" : "ASC";
      order = [[orderBy, dir]];
    }

    // Pagination
    const pageNum = parseInt(page, 10);
    const pageLimit = parseInt(limit, 10);
    const offset = (pageNum - 1) * pageLimit;

    // Role-based scoping via latest assignment
    // Managers/Admins: see all; apply assignee filter only if provided
    // Sales reps: restrict to latest assignment = self
    const latestInclude =
      role === "sales_rep"
        ? buildLatestAssignmentInclude(userId) // required join
        : buildLatestAssignmentInclude(assignee_id || null); // optional join unless filtering

    const { count, rows: leads } = await Lead.findAndCountAll({
      where,
      include: [
        { model: LeadStatus, attributes: ["id", "value", "label"] },
        { model: LeadSource, attributes: ["id", "value", "label"] },
        { model: User, as: "creator", attributes: ["id", "full_name", "email"] },
        { model: User, as: "updater", attributes: ["id", "full_name", "email"] },
        latestInclude,
      ],
      distinct: true,
      col: "id", // ⬅ fix: count DISTINCT on base PK only (avoid 'Lead->lead.id' mismatch)
      order,
      limit: pageLimit,
      offset,
    });

    return resSuccess(res, {
      leads,
      pagination: {
        total: count,
        page: pageNum,
        limit: pageLimit,
        totalPages: Math.ceil(count / pageLimit),
      },
    });
  } catch (err) {
    console.error("GetLeads Error:", err);
    return resError(res, "Internal server error", 500);
  }
};

/**
 * Get single lead by ID (with current assignee)
 */
const getLeadById = async (req, res) => {
  try {
    const { id } = req.params;

    const lead = await Lead.findByPk(id, {
      include: [
        { model: LeadStatus, attributes: ["id", "value", "label"] },
        { model: LeadSource, attributes: ["id", "value", "label"] },
        { model: User, as: "creator", attributes: ["id", "full_name", "email"] },
        { model: User, as: "updater", attributes: ["id", "full_name", "email"] },
        // current assignee only (latest assignment)
        {
          model: LeadAssignment,
          as: "LeadAssignments",
          required: false,
          where: { id: { [Op.in]: LATEST_ASSIGNMENT_IDS } },
          include: [{ model: User, as: "assignee", attributes: ["id", "full_name", "email"] }],
        },
      ],
    });

    if (!lead) return resError(res, "Lead not found", 404);
    return resSuccess(res, lead);
  } catch (err) {
    console.error("GetLeadById Error:", err);
    return resError(res, "Internal server error", 500);
  }
};

/**
 * Update lead
 * - Sales reps may only update leads currently assigned to them (latest assignment)
 */
const updateLead = async (req, res) => {
  try {
    const { id } = req.params;

    const lead = await Lead.findByPk(id);
    if (!lead) return resError(res, "Lead not found", 404);

    if (req.user.role === "sales_rep") {
      const latest = await LeadAssignment.findOne({
        where: { lead_id: id },
        order: [["id", "DESC"]],
        attributes: ["assignee_id"],
      });
      const currentAssigneeId = latest?.assignee_id ?? null;
      if (currentAssigneeId !== req.user.id) {
        return resError(res, "Sales rep can only update leads assigned to them", 403);
      }
    }

    const { first_name, last_name, company, email, phone, country, status_id, source_id, value_decimal, notes } =
      req.body;

    if (first_name !== undefined) lead.first_name = first_name;
    if (last_name !== undefined) lead.last_name = last_name;
    if (company !== undefined) lead.company = company;
    if (email !== undefined) lead.email = email;
    if (phone !== undefined) lead.phone = phone;
    if (country !== undefined) lead.country = country;
    if (status_id !== undefined) lead.status_id = status_id;
    if (source_id !== undefined) lead.source_id = source_id;
    if (value_decimal !== undefined) lead.value_decimal = value_decimal;
    if (notes !== undefined) lead.notes = notes;

    lead.updated_by = req.user.id;
    await lead.save();

    return resSuccess(res, lead);
  } catch (err) {
    console.error("UpdateLead Error:", err);
    return resError(res, "Internal server error", 500);
  }
};

/**
 * Delete lead (hard delete)
 */
const deleteLead = async (req, res) => {
  try {
    const { id } = req.params;

    const lead = await Lead.findByPk(id);
    if (!lead) return resError(res, "Lead not found", 404);

    await lead.destroy();
    return resSuccess(res, { message: "Lead deleted successfully" });
  } catch (err) {
    console.error("DeleteLead Error:", err);
    return resError(res, "Internal server error", 500);
  }
};

/**
 * Assign lead
 * Body: { assignee_id }
 */
const assignLead = async (req, res) => {
  try {
    const { id } = req.params; // lead_id
    const { assignee_id } = req.body;

    const lead = await Lead.findByPk(id);
    if (!lead) return resError(res, "Lead not found", 404);

    const user = await User.findByPk(assignee_id);
    if (!user) return resError(res, "Assignee not found", 404);

    const assignment = await LeadAssignment.create({
      lead_id: id,
      assignee_id,
      assigned_by: req.user.id,
    });

    return resSuccess(res, assignment, 201);
  } catch (err) {
    console.error("AssignLead Error:", err);
    return resError(res, "Internal server error", 500);
  }
};

/**
 * Get assignment history for a lead
 */
const getLeadAssignments = async (req, res) => {
  try {
    const { id } = req.params;

    const lead = await Lead.findByPk(id);
    if (!lead) return resError(res, "Lead not found", 404);

    const assignments = await LeadAssignment.findAll({
      where: { lead_id: id },
      include: [
        { model: User, as: "assignee", attributes: ["id", "full_name", "email"] },
        { model: User, as: "assigner", attributes: ["id", "full_name", "email"] },
      ],
      order: [["assigned_at", "DESC"]],
    });

    return resSuccess(res, assignments);
  } catch (err) {
    console.error("GetLeadAssignments Error:", err);
    return resError(res, "Internal server error", 500);
  }
};

// =============================
// Exports
// =============================
module.exports = {
  createLead,
  getLeads,
  getLeadById,
  updateLead,
  deleteLead,
  assignLead,
  getLeadAssignments,
};
