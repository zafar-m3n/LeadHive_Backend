const { Op } = require("sequelize");
const { Lead, LeadStatus, LeadSource, LeadAssignment, sequelize } = require("../models");

// Simple email validator (enough for imports; lets Sequelize do deeper checks if you keep validate:true)
const SIMPLE_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
const isEmailValid = (e) => SIMPLE_EMAIL_RE.test(e);

/**
 * Bulk insert leads from frontend-processed file (CSV parsed to JSON).
 * Body: { leads: [ { first_name?, last_name?, company?, email?, phone?, country?, status?, source?, value_decimal?, notes? } ] }
 * Rules:
 *  - status fallback -> 'new' (by label or value, case-insensitive)
 *  - source fallback -> 'facebook' (by label or value, case-insensitive)
 *  - duplicate detection -> by email only (skip duplicates; report notes)
 *  - invalid email rows -> SKIP (report notes)
 *  - create initial LeadAssignment to req.user.id for each inserted lead
 */
const importLeads = async (req, res) => {
  let t; // for safe rollback in catch
  try {
    const { leads } = req.body;
    if (!Array.isArray(leads) || leads.length === 0) {
      return res.status(400).json({ success: false, error: "No leads provided." });
    }

    // Start transaction using the instance on any model (reliable)
    const sequelizeInstance = Lead.sequelize;
    t = await sequelizeInstance.transaction();

    // -------- preload statuses/sources once
    const [statuses, sources] = await Promise.all([
      LeadStatus.findAll({ transaction: t }),
      LeadSource.findAll({ transaction: t }),
    ]);

    const statusMap = new Map();
    for (const s of statuses) {
      if (s.label) statusMap.set(String(s.label).trim().toLowerCase(), s);
      if (s.value) statusMap.set(String(s.value).trim().toLowerCase(), s);
    }
    const defaultStatus = statusMap.get("new") || null;

    const sourceMap = new Map();
    for (const s of sources) {
      if (s.label) sourceMap.set(String(s.label).trim().toLowerCase(), s);
      if (s.value) sourceMap.set(String(s.value).trim().toLowerCase(), s);
    }
    const defaultSource = sourceMap.get("facebook") || null;

    // -------- normalize inputs; dedupe within incoming file by email ONLY; skip invalid emails
    const prepared = [];
    const notes = []; // [{ index, email, note }]
    const seenEmails = new Set();

    leads.forEach((row, idx) => {
      const r = row || {};
      const email = r.email ? String(r.email).trim().toLowerCase() : null;

      // Skip invalid email formats entirely
      if (email && !isEmailValid(email)) {
        notes.push({ index: idx, email, note: "invalid_email_format" });
        return;
      }

      // In-file duplicate check (by email only, and only if email present)
      if (email && seenEmails.has(email)) {
        notes.push({ index: idx, email, note: "duplicate_email_in_file" });
        return;
      }
      if (email) seenEmails.add(email);

      // resolve status (row.status -> default 'new')
      let st = null;
      if (r.status) st = statusMap.get(String(r.status).trim().toLowerCase());
      if (!st) st = defaultStatus;

      // resolve source (row.source -> default 'facebook')
      let src = null;
      if (r.source) src = sourceMap.get(String(r.source).trim().toLowerCase());
      if (!src) src = defaultSource;

      // value_decimal normalization
      let valueDecimal = 0;
      if (r.value_decimal !== undefined && r.value_decimal !== null && r.value_decimal !== "") {
        const num = Number(r.value_decimal);
        valueDecimal = Number.isFinite(num) ? num : 0;
      }

      prepared.push({
        _rowIndex: idx,
        first_name: r.first_name ? String(r.first_name).trim() : null,
        last_name: r.last_name ? String(r.last_name).trim() : null,
        company: r.company ? String(r.company).trim() : null,
        email, // may be null; duplicates checked only when email present
        phone: r.phone ? String(r.phone).trim() : null,
        country: r.country ? String(r.country).trim() : null,
        status_id: st ? st.id : null,
        source_id: src ? src.id : null,
        value_decimal: valueDecimal,
        notes: r.notes ? String(r.notes).trim() : null,
        created_by: req.user?.id || null,
        updated_by: req.user?.id || null,
      });
    });

    if (prepared.length === 0) {
      await t.rollback();
      return res.status(400).json({
        success: false,
        error: "No valid rows to import.",
        details: { notes },
      });
    }

    // -------- DB duplicates by email only (skip rows with an email that already exists)
    const emails = prepared.map((p) => p.email).filter(Boolean);
    const existing = emails.length
      ? await Lead.findAll({
          where: { email: { [Op.in]: emails } },
          attributes: ["email"],
          transaction: t,
        })
      : [];
    const existingEmails = new Set(existing.map((e) => String(e.email).toLowerCase()));

    const toInsert = [];
    for (const p of prepared) {
      if (p.email && existingEmails.has(p.email)) {
        notes.push({ index: p._rowIndex, email: p.email, note: "duplicate_email_in_db" });
        continue;
      }
      toInsert.push(p);
    }

    if (toInsert.length === 0) {
      await t.rollback();
      return res.status(409).json({
        success: false,
        error: "All rows are duplicates or invalid (by email).",
        details: { notes },
      });
    }

    // -------- bulk insert leads
    const createdLeads = await Lead.bulkCreate(
      toInsert.map(({ _rowIndex, ...rest }) => rest),
      { validate: true, returning: true, transaction: t }
    );

    // -------- create initial LeadAssignment for each created lead (assign to creator)
    if (req.user?.id && createdLeads.length) {
      const assignments = createdLeads.map((l) => ({
        lead_id: l.id,
        assignee_id: req.user.id,
        assigned_by: req.user.id,
      }));
      await LeadAssignment.bulkCreate(assignments, { transaction: t });
    }

    await t.commit();

    return res.status(201).json({
      success: true,
      message: `${createdLeads.length} leads imported successfully.`,
      summary: {
        attempted: leads.length,
        inserted: createdLeads.length,
        duplicates_or_skipped: notes.length, // includes invalid_email_format + dupes
      },
      notes, // contains { invalid_email_format, duplicate_email_in_file, duplicate_email_in_db }
      data: createdLeads,
    });
  } catch (err) {
    console.error("Import Error:", err);
    if (t) {
      try {
        await t.rollback();
      } catch (_) {}
    }
    return res.status(500).json({ success: false, error: "Error importing leads." });
  }
};

/**
 * Return the expected schema for frontend reference
 */
const getTemplateSchema = async (req, res) => {
  try {
    return res.json({
      fields: [
        "first_name",
        "last_name",
        "company",
        "email",
        "phone",
        "country",
        "status", // accepts label or value; fallback 'new'
        "source", // accepts label or value; fallback 'facebook'
        "value_decimal",
        "notes",
      ],
      defaults: {
        status: "new",
        source: "facebook",
      },
      duplicate_check: "email_only",
      notes: [
        "If status is missing or invalid, 'new' is used.",
        "If source is missing or invalid, 'facebook' is used.",
        "Duplicates are detected by email only.",
        "Rows with invalid email format are skipped.",
      ],
    });
  } catch (err) {
    console.error("Schema Error:", err);
    return res.status(500).json({ success: false, error: "Could not fetch template schema." });
  }
};

module.exports = {
  importLeads,
  getTemplateSchema,
};
