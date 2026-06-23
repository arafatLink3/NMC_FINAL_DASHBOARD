// BRAS read-only API — exposes only the search & export endpoints, for
// any caller that should NOT be allowed to upload (e.g. third-party BI
// integrations, kiosk dashboards, etc.).
//
// Mount with:  app.use('/api/bras-public', require('./routes/brasApi'));
'use strict';

const express = require('express');
const { searchBras, exportBras } = require('../controllers/brasController');

const router = express.Router();

router.get('/search', searchBras);
router.get('/export', exportBras);

module.exports = router;
