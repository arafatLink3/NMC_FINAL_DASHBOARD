'use strict';

// Sequelize model for the `bras_records` table.
//
// The module exposes a *ready-to-use* model class as the default export, so
// callers can do:
//
//     const BrasRecord = require('../models/BrasRecord');
//     await BrasRecord.findAll();
//
// A `getFactory()` helper is also exposed for tooling that needs to
// (re-)initialize the model against a specific Sequelize instance, e.g.
// migrations or test fixtures:
//
//     const factory = require('../models/BrasRecord').getFactory();
//     const Model = factory(sequelize);
//
// Snake_case contract (kept consistent with the migration and the API):
//   • All DB columns are snake_case: `bras_name`, `sa_team_leader`, etc.
//   • The unique `loopback` index is named `uq_bras_loopback`.
//   • The performance indexes are `idx_bras_records_bras_name`,
//     `idx_bras_records_sa_contact`, `idx_bras_records_scr_id`.
//   • `underscored: true` automatically maps camelCase JS attributes
//     (e.g. `brasName`) to snake_case DB columns (`bras_name`).
// =============================================================================

const { DataTypes, Sequelize } = require('sequelize');

// ---------------------------------------------------------------------------
// Connection resolution
//
// We try to derive a Sequelize instance from the process environment so the
// model file can be `require`d without a bootstrap script. Override any of
// `DB_DIALECT`, `DB_STORAGE`, `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`,
// `DB_PASS` to point at a real database.
// ---------------------------------------------------------------------------
function resolveSequelize() {
  const opts = {
    dialect: process.env.DB_DIALECT || 'sqlite',
    logging: false,
  };
  if (opts.dialect === 'sqlite') {
    opts.storage = process.env.DB_STORAGE || ':memory:';
  } else {
    opts.host     = process.env.DB_HOST || 'localhost';
    opts.port     = Number(process.env.DB_PORT) || 3306;
    opts.database = process.env.DB_NAME || 'nmc_dashboard';
    opts.username = process.env.DB_USER || 'root';
    opts.password = process.env.DB_PASS || '';
  }
  return new Sequelize(opts);
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------
function buildFactory(sequelize) {
  const DataTypesLocal = require('sequelize').DataTypes;

  const BrasRecord = sequelize.define(
    'BrasRecord',
    {
      id: {
        type: DataTypesLocal.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },
      sl: {
        type: DataTypesLocal.STRING(50),
        allowNull: true,
      },
      brasName: {
        type: DataTypesLocal.STRING(255),
        allowNull: false,
        field: 'bras_name',
      },
      loopback: {
        type: DataTypesLocal.STRING(64),
        allowNull: false,
        unique: { name: 'uq_bras_loopback' },
      },
      zone: {
        type: DataTypesLocal.STRING(50),
        allowNull: true,
      },
      saTeamLeader: {
        type: DataTypesLocal.STRING(255),
        allowNull: true,
        field: 'sa_team_leader',
      },
      serviceAgentName: {
        type: DataTypesLocal.STRING(255),
        allowNull: true,
        field: 'service_agent_name',
      },
      serviceAgentContactNumber: {
        type: DataTypesLocal.STRING(32),
        allowNull: true,
        field: 'service_agent_contact_number',
      },
      commission: {
        type: DataTypesLocal.STRING(100),
        allowNull: true,
      },
      nttn: {
        type: DataTypesLocal.STRING(255),
        allowNull: true,
      },
      scrId: {
        type: DataTypesLocal.STRING(100),
        allowNull: true,
        field: 'scr_id',
      },
      misBranchName: {
        type: DataTypesLocal.STRING(255),
        allowNull: true,
        field: 'mis_branch_name',
      },
      createdAt: {
        type: DataTypesLocal.DATE,
        allowNull: false,
        field: 'created_at',
      },
      updatedAt: {
        type: DataTypesLocal.DATE,
        allowNull: false,
        field: 'updated_at',
      },
    },
    {
      tableName: 'bras_records',
      timestamps: true,
      underscored: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      indexes: [
        { name: 'idx_bras_records_bras_name',  fields: ['bras_name'] },
        { name: 'idx_bras_records_sa_contact', fields: ['service_agent_contact_number'] },
        { name: 'idx_bras_records_scr_id',     fields: ['scr_id'] },
      ],
    }
  );

  return BrasRecord;
}

// ---------------------------------------------------------------------------
// Lazy default export — the model is built the first time it's required.
//
// We use a Proxy so the export `BrasRecord.findAll`, `BrasRecord.create`,
// etc. work as if it were a real Sequelize class. The first attribute access
// triggers initialization.
// ---------------------------------------------------------------------------
let _model = null;
function getModel() {
  if (_model) return _model;
  const sequelize = resolveSequelize();
  _model = buildFactory(sequelize);
  return _model;
}

const BrasRecordProxy = new Proxy(
  function BrasRecord() { return getModel(); },
  {
    get: function (_target, prop) {
      const m = getModel();
      const v = m[prop];
      return typeof v === 'function' ? v.bind(m) : v;
    },
    construct: function (_target, args) {
      return new (getModel())(...args);
    },
    apply: function (_target, _this, args) {
      return getModel()(...args);
    },
  }
);

module.exports = BrasRecordProxy;
module.exports.getFactory = buildFactory;
module.exports.getModel = getModel;
