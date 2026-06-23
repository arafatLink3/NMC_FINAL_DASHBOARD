// =============================================================================
//  BRAS controller — single source of truth for the BRAS Database Management
//  module. Exposes three handlers consumed by `routes/bras.js`:
//
//      POST /api/bras/import    → importBras   (stub: 501 not-implemented)
//      GET  /api/bras/search    → searchBras   (PRIMARY — full implementation)
//      GET  /api/bras/export    → exportBras   (stub: 501 not-implemented)
//
//  Wire protocol (must stay in lock-step with `js/pages/bras.js`):
//    • All response keys are lowercase snake_case (no aliases, no camelCase).
//    • `null` / `undefined` cell values are serialized as "" (empty string)
//      so the DataTables UI never sees a `null` token.
//    • Contact numbers are sanitized — every leading `/` is stripped —
//      because raw Excel/Sheets paste often prepends a slash to phones.
//    • Search uses Sequelize `Op.like` with `%term%` for wildcard fuzzy
//      matching across the operator-searchable columns.
//
//  Note on the per-request `require()` calls inside `searchBras`:
//    The spec calls `require('sequelize')` and `require('../models')` *inside*
//    the handler body. That's a deliberate fidelity choice for this pass —
//    both modules are cached by Node's require cache, so the overhead is
//    one hash lookup per request (negligible). If we move them to module
//    top later for cleanliness, the `searchBras` function body does not
//    change.
// =============================================================================
'use strict';

/* -------------------------------------------------------------------------- */
/*  Controllers                                                               */
/* -------------------------------------------------------------------------- */

/**
 * GET /api/bras/search?q=…
 *   Returns: { ok, data: [ snake_case row, … ] }
 *   The `q` parameter is matched with `Op.like '%term%'` across the
 *   operator-searchable columns (wildcard fuzzy filtering).
 *
 *   Each row is mapped through a `r.<col> ? String(r.<col>).trim() : ''`
 *   projection, which guarantees a clean snake_case JSON shape with `""`
 *   for empty values and a sanitized contact number (every leading `/`
 *   stripped). This pattern keeps the response shape identical to what
 *   `js/pages/bras.js` reads via DataTables `columns.data` keys.
 */
exports.searchBras = async (req, res) => {
  try {
    const term = (req.query.q || '').toString().trim();
    const { Op } = require('sequelize');
    const { BrasRecord } = require('../models');

    let where = {};
    if (term) {
      where = {
        [Op.or]: ['sl', 'bras_name', 'loopback', 'service_agent_name', 'service_agent_contact_number', 'scr_id'].map(f => ({ [f]: { [Op.like]: `%${term}%` } }))
      };
    }
    const rows = await BrasRecord.findAll({ where, order: [['id', 'ASC']], raw: true });

    const formatted = rows.map(r => ({
      sl: r.sl ? String(r.sl).trim() : '',
      bras_name: r.bras_name ? String(r.bras_name).trim() : '',
      loopback: r.loopback ? String(r.loopback).trim() : '',
      zone: r.zone ? String(r.zone).trim() : '',
      sa_team_leader: r.sa_team_leader ? String(r.sa_team_leader).trim() : '',
      service_agent_name: r.service_agent_name ? String(r.service_agent_name).trim() : '',
      service_agent_contact_number: r.service_agent_contact_number ? String(r.service_agent_contact_number).replace(/\//g, '').trim() : '',
      commission: r.commission ? String(r.commission).trim() : '',
      nttn: r.nttn ? String(r.nttn).trim() : '',
      scr_id: r.scr_id ? String(r.scr_id).trim() : '',
      mis_branch_name: r.mis_branch_name ? String(r.mis_branch_name).trim() : ''
    }));
    return res.json({ ok: true, data: formatted });
  } catch (err) { return res.status(500).json({ ok: false, error: err.message }); }
};

/**
 * POST /api/bras/import
 *   Stub — returns 501 Not Implemented. Wire this up in a follow-up by
 *   re-instating the XLSX/multipart pipeline that lived here in the prior
 *   iteration (parse buffer → header alias map → dedupe by `loopback`).
 */
exports.importBras = async (req, res) => {
  return res.status(501).json({
    ok: false,
    error: 'importBras not implemented in this iteration'
  });
};

/**
 * GET /api/bras/export?q=…
 *   Stub — returns 501 Not Implemented. Wire this up in a follow-up by
 *   re-instating the XLSX workbook streaming pipeline that lived here in
 *   the prior iteration (sheet headers from EXPORT_COLUMNS, rows mapped
 *   through cleanValue).
 */
exports.exportBras = async (req, res) => {
  return res.status(501).json({
    ok: false,
    error: 'exportBras not implemented in this iteration'
  });
};
