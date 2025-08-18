const { Lead, LeadStatus, LeadSource } = require("../models");

/**
 * Bulk insert leads from frontend-processed file (CSV/Excel parsed to JSON).
 * Expected request body: { leads: [ { first_name, last_name, company, email, phone, country, status, source, value_decimal, notes } ] }
 */
const importLeads = async (req, res) => {
  try {
    const { leads } = req.body;

    if (!leads || !Array.isArray(leads) || leads.length === 0) {
      return res.status(400).json({
        success: false,
        error: "No leads provided.",
      });
    }

    const createdLeads = [];

    for (const row of leads) {
      // Resolve status
      let status = null;
      if (row.status) {
        status = await LeadStatus.findOne({ where: { label: row.status } });
      }
      if (!status) {
        status = await LeadStatus.findOne({ where: { value: "new" } }); // fallback
      }

      // Resolve source
      let source = null;
      if (row.source) {
        source = await LeadSource.findOne({ where: { label: row.source } });
      }

      // Insert lead
      const newLead = await Lead.create({
        first_name: row.first_name || null,
        last_name: row.last_name || null,
        company: row.company || null,
        email: row.email || null,
        phone: row.phone || null,
        country: row.country || null,
        status_id: status ? status.id : null,
        source_id: source ? source.id : null,
        value_decimal: row.value_decimal ? parseFloat(row.value_decimal) : 0.0,
        notes: row.notes || null,
        created_by: req.user.id,
        updated_by: req.user.id,
      });

      createdLeads.push(newLead);
    }

    return res.status(201).json({
      success: true,
      message: `${createdLeads.length} leads imported successfully.`,
      data: createdLeads,
    });
  } catch (err) {
    console.error("Import Error:", err.message);
    return res.status(500).json({
      success: false,
      error: "Error importing leads.",
    });
  }
};

/**
 * Return the expected schema for frontend reference
 */
const getTemplateSchema = (req, res) => {
  return res.json({
    fields: [
      "first_name",
      "last_name",
      "company",
      "email",
      "phone",
      "country",
      "status",
      "source",
      "value_decimal",
      "notes",
    ],
  });
};

module.exports = {
  importLeads,
  getTemplateSchema,
};
