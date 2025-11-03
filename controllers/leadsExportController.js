// controllers/leadsExportController.js
const { Op } = require("sequelize");
const { Lead, LeadStatus, LeadSource } = require("../models");
const { resSuccess, resError } = require("../utils/responseUtil");

// ---- filters: ONLY status_ids and source_ids ----
function buildExportQueryParts(req) {
  const { status_ids, source_ids } =
    req.body?.filters && typeof req.body.filters === "object" ? req.body.filters : req.body || {};

  const where = {};

  if (status_ids) {
    const ids = String(status_ids)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (ids.length) where.status_id = { [Op.in]: ids };
  }

  if (source_ids) {
    const ids = String(source_ids)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (ids.length) where.source_id = { [Op.in]: ids };
  }

  // Always include status/source so we can export their labels
  const include = [
    { model: LeadStatus, attributes: ["id", "value", "label"] },
    { model: LeadSource, attributes: ["id", "value", "label"] },
  ];

  // No explicit order -> DB default
  return { where, include };
}

// ---- CSV helpers ----
const CSV_DELIM = ",";
const CRLF = "\r\n";

function csvEscape(value) {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (s === "") return "";
  const needsQuote = /[",\r\n]/.test(s);
  const safe = s.replace(/"/g, '""');
  return needsQuote ? `"${safe}"` : safe;
}

function writeCsvHeader(res) {
  const header =
    ["first_name", "last_name", "company", "email", "phone", "country", "status", "source", "value_decimal"].join(
      CSV_DELIM
    ) + CRLF;
  // UTF-8 BOM for Excel
  res.write("\uFEFF" + header);
}

function leadToCsvRow(l) {
  const cells = [
    csvEscape(l.first_name || ""),
    csvEscape(l.last_name || ""),
    csvEscape(l.company || ""),
    csvEscape(l.email || ""),
    csvEscape(l.phone || ""),
    csvEscape(l.country || ""),
    csvEscape(l?.LeadStatus?.label || ""),
    csvEscape(l?.LeadSource?.label || ""),
    (typeof l.value_decimal === "number" ? l.value_decimal : l.value_decimal ? Number(l.value_decimal) : 0) || 0,
  ];
  return cells.join(CSV_DELIM) + CRLF;
}

/**
 * POST /api/v1/leads/export/count
 * Body: { filters: { status_ids?: "1,2", source_ids?: "3,4" } }
 * Response: { code: "OK", data: { count } }
 *
 * NOTE: Count is computed the same way your getLeads controller does:
 * use include + distinct with findAndCountAll to avoid overcount with joins.
 */
const exportCount = async (req, res) => {
  try {
    const { where, include } = buildExportQueryParts(req);

    const { count } = await Lead.findAndCountAll({
      where,
      include,
      distinct: true,
      col: "id",
      // tiny limit to make Sequelize issue the count query without fetching rows
      limit: 1,
    });

    return resSuccess(res, { count });
  } catch (err) {
    console.error("ExportCount Error:", err);
    return resError(res, "Failed to get export count", 500);
  }
};

/**
 * POST /api/v1/leads/export/download
 * Body: { filters: { status_ids?: "1,2", source_ids?: "3,4" } }
 * Streams CSV with columns: first_name,last_name,company,email,phone,country,status,source,value_decimal
 */
const exportDownload = async (req, res) => {
  try {
    const { where, include } = buildExportQueryParts(req);

    // Quick zero-check (same join context as download)
    const { count } = await Lead.findAndCountAll({
      where,
      include,
      distinct: true,
      col: "id",
      limit: 1,
    });
    if (!count) return resSuccess(res, { message: "No leads match the filters", rows: 0 });

    // CSV headers
    const now = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const fname = `leads_export_${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(
      now.getHours()
    )}${pad(now.getMinutes())}.csv`;

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${fname}"`);

    // Header row + BOM
    writeCsvHeader(res);

    const PAGE_SIZE = 5000;
    let offset = 0;

    while (true) {
      const rows = await Lead.findAll({
        where,
        include,
        // default DB order (no 'order' passed)
        limit: PAGE_SIZE,
        offset,
        attributes: [
          "id",
          "first_name",
          "last_name",
          "company",
          "email",
          "phone",
          "country",
          "status_id",
          "source_id",
          "value_decimal",
        ],
      });

      if (!rows.length) break;

      for (const l of rows) {
        res.write(leadToCsvRow(l));
      }

      offset += PAGE_SIZE;
    }

    res.end();
  } catch (err) {
    console.error("ExportDownload Error:", err);
    if (!res.headersSent) {
      return resError(res, "Failed to generate export", 500);
    } else {
      try {
        res.end();
      } catch (_) {}
    }
  }
};

module.exports = { exportCount, exportDownload };
