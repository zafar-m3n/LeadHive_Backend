const { Op, fn, col, where } = require("sequelize");
const validator = require("validator");
const { Lead, LeadStatus, LeadSource, LeadAssignment } = require("../models");

// --- helpers ---
const sanitizeStr = (v) =>
  v === undefined || v === null
    ? ""
    : String(v)
        .replace(/\u00A0/g, " ")
        .trim();

const toSnakeValue = (label) => {
  if (!label) return null;
  return String(label)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
};

const normalizePhoneDigits = (p) => (p ? String(p) : "").replace(/\D+/g, "").slice(0, 32); // digits-only, capped

/**
 * Bulk insert leads from frontend-processed file (CSV parsed to JSON).
 * Body: { leads: [ { first_name?, last_name?, company?, email?, phone?, country?, status?, source?, value_decimal?, notes? } ] }
 * Rules:
 *  - status fallback -> 'new' (by label or value, case-insensitive)
 *  - source fallback -> 'facebook' (by label or value, case-insensitive) and auto-create unknown sources
 *  - duplicate detection -> by email OR phone (digits-only normalization)
 *  - invalid email rows -> SKIP (record note)
 *  - create initial LeadAssignment to req.user.id for each inserted lead
 */
const importLeads = async (req, res) => {
  let t;
  try {
    const { leads } = req.body;
    if (!Array.isArray(leads) || leads.length === 0) {
      return res.status(400).json({ success: false, error: "No leads provided." });
    }

    const sequelizeInstance = Lead.sequelize;
    t = await sequelizeInstance.transaction();

    // ---- STEP 1: Ensure all referenced sources exist (including default 'facebook')
    const incomingSourceLabels = new Set();
    for (const r of leads) {
      const src = sanitizeStr(r?.source);
      if (src) incomingSourceLabels.add(src);
    }
    incomingSourceLabels.add("facebook");

    if (incomingSourceLabels.size) {
      const candidateRows = Array.from(incomingSourceLabels)
        .map((label) => ({
          value: toSnakeValue(label),
          label: String(label).trim().slice(0, 80),
        }))
        .filter((r) => r.value && r.label);

      const seenVals = new Set();
      const uniqueRows = [];
      for (const r of candidateRows) {
        if (!seenVals.has(r.value)) {
          seenVals.add(r.value);
          uniqueRows.push(r);
        }
      }

      if (uniqueRows.length) {
        await LeadSource.bulkCreate(uniqueRows, {
          ignoreDuplicates: true,
          transaction: t,
        });
      }
    }

    // ---- STEP 2: Preload statuses/sources once (now that sources are ensured)
    const [statuses, sources] = await Promise.all([
      LeadStatus.findAll({ transaction: t }),
      LeadSource.findAll({ transaction: t }),
    ]);

    const statusMap = new Map();
    for (const s of statuses) {
      if (s.label) statusMap.set(sanitizeStr(s.label).toLowerCase(), s);
      if (s.value) statusMap.set(sanitizeStr(s.value).toLowerCase(), s);
    }
    const defaultStatus = statusMap.get("new") || null;

    const sourceMap = new Map();
    for (const s of sources) {
      if (s.label) sourceMap.set(sanitizeStr(s.label).toLowerCase(), s);
      if (s.value) sourceMap.set(sanitizeStr(s.value).toLowerCase(), s);
    }
    const defaultSource = sourceMap.get("facebook") || null;

    // ---- STEP 3: Normalize inputs; in-file duplicate detection by email OR phone
    const prepared = [];
    const notes = []; // [{ index, email?, phone?, note }]
    const seenEmails = new Set();
    const seenPhones = new Set(); // normalized digits-only

    leads.forEach((row, idx) => {
      const r = row || {};

      // sanitize & normalize fields
      let email = sanitizeStr(r.email).toLowerCase();
      if (email === "") email = null; // treat empty as null

      const phoneRaw = sanitizeStr(r.phone) || null;
      const phoneNorm = phoneRaw ? normalizePhoneDigits(phoneRaw) : null;

      // Email format check (if provided) — use validator.js (same as Sequelize)
      if (email && !validator.isEmail(email)) {
        notes.push({ index: idx, email, note: "invalid_email_format" });
        return; // SKIP this row as requested
      }

      // In-file duplicate by email
      if (email && seenEmails.has(email)) {
        notes.push({ index: idx, email, note: "duplicate_email_in_file" });
        return;
      }
      if (email) seenEmails.add(email);

      // In-file duplicate by phone (digits-only)
      if (phoneNorm && seenPhones.has(phoneNorm)) {
        notes.push({ index: idx, phone: phoneRaw, note: "duplicate_phone_in_file" });
        return;
      }
      if (phoneNorm) seenPhones.add(phoneNorm);

      // Resolve status (fallback 'new')
      let st = null;
      const rStatus = sanitizeStr(r.status).toLowerCase();
      if (rStatus) st = statusMap.get(rStatus);
      if (!st) st = defaultStatus;

      // Resolve source (fallback 'facebook')
      let src = null;
      const rSource = sanitizeStr(r.source).toLowerCase();
      if (rSource) src = sourceMap.get(rSource);
      if (!src) src = defaultSource;

      // value_decimal normalization
      let valueDecimal = 0;
      if (r.value_decimal !== undefined && r.value_decimal !== null && String(r.value_decimal) !== "") {
        const num = Number(r.value_decimal);
        valueDecimal = Number.isFinite(num) ? num : 0;
      }

      prepared.push({
        _rowIndex: idx,
        first_name: sanitizeStr(r.first_name) || null,
        last_name: sanitizeStr(r.last_name) || null,
        company: sanitizeStr(r.company) || null,
        email, // may be null
        phone: phoneRaw, // store original raw, compare using normalized set
        _phoneNorm: phoneNorm, // internal use only
        country: sanitizeStr(r.country) || null,
        status_id: st ? st.id : null,
        source_id: src ? src.id : null,
        value_decimal: valueDecimal,
        notes: sanitizeStr(r.notes) || null,
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

    // ---- STEP 4: DB duplicate detection by email OR phone (digits-only)
    const emails = prepared.map((p) => p.email).filter(Boolean);
    const phoneNorms = Array.from(new Set(prepared.map((p) => p._phoneNorm).filter(Boolean)));

    const whereClauses = [];
    if (emails.length) {
      whereClauses.push({ email: { [Op.in]: emails } });
    }
    if (phoneNorms.length) {
      // MySQL 8+: REGEXP_REPLACE(phone, '[^0-9]', '') IN (:phoneNorms)
      const normalizedDbPhone = fn("REGEXP_REPLACE", col("phone"), "[^0-9]", "");
      whereClauses.push(where(normalizedDbPhone, { [Op.in]: phoneNorms }));
    }

    const existing = whereClauses.length
      ? await Lead.findAll({
          where: { [Op.or]: whereClauses },
          attributes: ["email", "phone"],
          transaction: t,
        })
      : [];

    const existingEmails = new Set(
      existing
        .map((e) => e.email)
        .filter(Boolean)
        .map((e) => String(e).toLowerCase())
    );

    const existingPhoneNorms = new Set(existing.map((e) => normalizePhoneDigits(e.phone)).filter(Boolean));

    const toInsert = [];
    for (const p of prepared) {
      if (p.email && existingEmails.has(p.email)) {
        notes.push({ index: p._rowIndex, email: p.email, note: "duplicate_email_in_db" });
        continue;
      }
      if (p._phoneNorm && existingPhoneNorms.has(p._phoneNorm)) {
        notes.push({ index: p._rowIndex, phone: p.phone, note: "duplicate_phone_in_db" });
        continue;
      }
      toInsert.push(p);
    }

    if (toInsert.length === 0) {
      await t.rollback();
      return res.status(409).json({
        success: false,
        error: "All rows are duplicates or invalid (by email/phone).",
        details: { notes },
      });
    }

    // ---- STEP 5: Insert leads
    const createdLeads = await Lead.bulkCreate(
      toInsert.map(({ _rowIndex, _phoneNorm, ...rest }) => rest),
      { validate: true, returning: true, transaction: t }
    );

    // ---- STEP 6: Create initial assignments to creator
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
        duplicates_or_skipped: notes.length,
      },
      notes, // includes: invalid_email_format, duplicate_*_in_file, duplicate_*_in_db
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
        "source", // accepts label or value; fallback 'facebook' (auto-created if missing)
        "value_decimal",
        "notes",
      ],
      defaults: {
        status: "new",
        source: "facebook",
      },
      duplicate_check: "email_or_phone (phone compared by digits-only)",
      notes: [
        "If status is missing or invalid, 'new' is used.",
        "If source is missing or invalid, 'facebook' is used.",
        "Unknown sources are created automatically (value = lowercase_with_underscores, label = original).",
        "Duplicates are detected by email OR phone; phone is normalized to digits-only for comparison.",
        "Rows with invalid email format are skipped.",
      ],
    });
  } catch (err) {
    console.error("Schema Error:", err);
    return res.status(500).json({ success: false, error: "Could not fetch template schema." });
  }
};

module.exports = { importLeads, getTemplateSchema };
