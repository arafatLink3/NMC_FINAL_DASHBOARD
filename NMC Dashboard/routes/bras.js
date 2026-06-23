// BRAS routes — single Express router that exposes:
//
//   POST /api/bras/import   multipart upload of a .xlsx/.xls/.csv
//   GET  /api/bras/search   free-text search across the operator fields
//   GET  /api/bras/export   stream the matching rows as .xlsx
//
// Mount with:  app.use('/api/bras', require('./routes/bras'));
'use strict';

const express = require('express');
const multer  = require('multer');

const ctrl = require('../controllers/brasController');

const router = express.Router();

/* -------------------------------------------------------------------------- */
/*  Upload middleware                                                          */
/* -------------------------------------------------------------------------- */

const ALLOWED_MIME = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'application/vnd.ms-excel',                                          // .xls
  'text/csv',
  'application/csv',
  'application/octet-stream',                                          // some browsers
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB
  fileFilter: (_req, file, cb) => {
    const ext = (file.originalname || '').toLowerCase().split('.').pop();
    if (ext === 'xlsx' || ext === 'xls' || ext === 'csv') return cb(null, true);
    if (file.mimetype && ALLOWED_MIME.has(file.mimetype)) return cb(null, true);
    return cb(new Error('Only .xlsx, .xls and .csv files are allowed'));
  },
});

/* -------------------------------------------------------------------------- */
/*  Routes                                                                     */
/* -------------------------------------------------------------------------- */

router.post('/import', upload.single('file'), ctrl.importBras);
router.get('/search',  ctrl.searchBras);
router.get('/export',  ctrl.exportBras);

// Surface multer's "file too large" / "bad file type" errors as 400s.
router.use((err, _req, res, next) => {
  if (err && (err.code === 'LIMIT_FILE_SIZE' || /Only \.xlsx/.test(err.message || ''))) {
    return res.status(400).json({ ok: false, error: err.message });
  }
  return next(err);
});

module.exports = router;
