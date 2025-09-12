"use strict";

const { Op, literal } = require("sequelize");
const {
  Lead,
  LeadStatus,
  LeadSource,
  User,
  LeadAssignment,
  LeadNote, // NEW: for multi-notes
} = require("../models");
const { sequelize } = require("../config/database");
const { resSuccess, resError } = require("../utils/responseUtil");

/** Subquery: latest LeadAssignment row id per lead */
const LATEST_ASSIGNMENT_IDS = literal(`(SELECT MAX(id) FROM lead_assignments GROUP BY lead_id)`);

/** Build include that joins ONLY the latest assignment per lead; optionally filter by assignee_id and/or assigned_at range */
const buildLatestAssignmentInclude = (
  assigneeId = null,
  assignedFrom = null,
  assignedTo = null,
  forceRequired = false
) => {
  const where = { id: { [Op.in]: LATEST_ASSIGNMENT_IDS } };

  if (assigneeId) where.assignee_id = Number(assigneeId);

  if (assignedFrom || assignedTo) {
    where.assigned_at = {};
    if (assignedFrom) where.assigned_at[Op.gte] = assignedFrom;
    if (assignedTo) where.assigned_at[Op.lte] = assignedTo;
  }

  return {
    model: LeadAssignment,
    as: "LeadAssignments",
    required: forceRequired || !!assigneeId || !!(assignedFrom || assignedTo),
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
 * - If 'notes' is provided (non-empty string), a LeadNote is created with author = req.user.id
 * - Initial assignment is created to the creator
 */
const createLead = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { first_name, last_name, company, email, phone, country, status_id, source_id, value_decimal, notes } =
      req.body;

    if (!status_id) {
      await t.rollback();
      return resError(res, "status_id is required", 400);
    }

    // 1) Create lead
    const lead = await Lead.create(
      {
        first_name,
        last_name,
        company,
        email,
        phone,
        country,
        status_id,
        source_id,
        value_decimal: value_decimal ?? 0.0,
        created_by: req.user.id,
      },
      { transaction: t }
    );

    // 2) Initial assignment to creator
    await LeadAssignment.create(
      {
        lead_id: lead.id,
        assignee_id: req.user.id,
        assigned_by: req.user.id,
      },
      { transaction: t }
    );

    // 3) Optional: create initial note (back-compat for clients still sending "notes")
    if (typeof notes === "string" && notes.trim().length > 0) {
      await LeadNote.create(
        {
          lead_id: lead.id,
          author_id: req.user.id,
          body: notes.trim(),
        },
        { transaction: t }
      );
    }

    await t.commit();
    return resSuccess(res, lead, 201);
  } catch (err) {
    console.error("CreateLead Error:", err);
    try {
      await t.rollback();
    } catch (_) {}
    return resError(res, "Internal server error", 500);
  }
};

/**
 * Get leads by role with optional filters, pagination, search, and date-assigned range
 * - Admin/Manager: see all; optional filter by current assignee (latest assignment) and/or assigned_at range
 * - Sales Rep: only leads whose latest assignment is the current user; may also filter by assigned_at range
 * Query params:
 *  - status_id, source_id, assignee_id
 *  - search, orderBy, orderDir
 *  - page=1, limit=10
 *  - assigned_from=YYYY-MM-DD, assigned_to=YYYY-MM-DD   (both inclusive)
 */
const getLeads = async (req, res) => {
  try {
    const { role, id: userId } = req.user;
    const {
      status_id,
      source_id,
      assignee_id,
      orderBy,
      orderDir,
      search,
      page = 1,
      limit = 10,
      assigned_from,
      assigned_to,
    } = req.query;

    const where = {};

    // Filters on Lead fields
    if (status_id) where.status_id = status_id;
    if (source_id) where.source_id = source_id;

    // Search
    if (search) {
      const digitsOnly = String(search).replace(/\D+/g, "");
      const orClauses = [
        { first_name: { [Op.like]: `%${search}%` } },
        { last_name: { [Op.like]: `%${search}%` } },
        { email: { [Op.like]: `%${search}%` } },
        { phone: { [Op.like]: `%${search}%` } }, // general phone substring
      ];

      // If user typed a short numeric tail (e.g., last 5 digits), also match phones that end with it
      if (digitsOnly.length >= 3 && digitsOnly.length <= 5) {
        // Suffix match; works even if there are separators in stored phone
        orClauses.push({ phone: { [Op.like]: `%${digitsOnly}` } });
      }

      where[Op.or] = orClauses;
    }

    // Parse date range (inclusive day bounds)
    let assignedFrom = null;
    let assignedTo = null;
    if (assigned_from) {
      const d = new Date(assigned_from);
      if (!isNaN(d)) {
        // start of day UTC
        assignedFrom = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
      }
    }
    if (assigned_to) {
      const d = new Date(assigned_to);
      if (!isNaN(d)) {
        // end of day UTC
        assignedTo = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999));
      }
    }

    // Ordering
    let order = [["id", "ASC"]];
    if (orderBy) {
      const dir = (orderDir || "ASC").toUpperCase() === "DESC" ? "DESC" : "ASC";
      if (orderBy === "assigned_at") {
        // sort by latest assignment timestamp
        order = [[{ model: LeadAssignment, as: "LeadAssignments" }, "assigned_at", dir]];
      } else {
        order = [[orderBy, dir]];
      }
    }

    // Pagination
    const pageNum = parseInt(page, 10);
    const pageLimit = parseInt(limit, 10);
    const offset = (pageNum - 1) * pageLimit;

    // Role-based scoping via latest assignment:
    // - Sales reps: restrict to latest assignment = self (required join)
    // - Admin/Managers: optional join, but becomes required if assignee filter OR date filter present
    const needDateFilter = !!(assignedFrom || assignedTo);
    const latestInclude =
      role === "sales_rep"
        ? buildLatestAssignmentInclude(userId, assignedFrom, assignedTo, true)
        : buildLatestAssignmentInclude(assignee_id || null, assignedFrom, assignedTo, needDateFilter || !!assignee_id);

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
      col: "id",
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
 * Get single lead by ID (with current assignee + notes with author)
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
        {
          model: LeadAssignment,
          as: "LeadAssignments",
          required: false,
          where: { id: { [Op.in]: LATEST_ASSIGNMENT_IDS } },
          include: [{ model: User, as: "assignee", attributes: ["id", "full_name", "email"] }],
        },
        {
          model: LeadNote,
          as: "notes",
          required: false,
          separate: true,
          include: [{ model: User, as: "author", attributes: ["id", "full_name", "email"] }],
          order: [["created_at", "DESC"]],
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
 * - If request contains "notes" (non-empty string), append a new LeadNote (author = current user)
 */
const updateLead = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { id } = req.params;

    const lead = await Lead.findByPk(id, { transaction: t });
    if (!lead) {
      await t.rollback();
      return resError(res, "Lead not found", 404);
    }

    if (req.user.role === "sales_rep") {
      const latest = await LeadAssignment.findOne({
        where: { lead_id: id },
        order: [["id", "DESC"]],
        attributes: ["assignee_id"],
        transaction: t,
      });
      const currentAssigneeId = latest?.assignee_id ?? null;
      if (currentAssigneeId !== req.user.id) {
        await t.rollback();
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

    lead.updated_by = req.user.id;
    await lead.save({ transaction: t });

    if (typeof notes === "string" && notes.trim().length > 0) {
      await LeadNote.create(
        {
          lead_id: lead.id,
          author_id: req.user.id,
          body: notes.trim(),
        },
        { transaction: t }
      );
    }

    await t.commit();
    return resSuccess(res, lead);
  } catch (err) {
    console.error("UpdateLead Error:", err);
    try {
      await t.rollback();
    } catch (_) {}
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
