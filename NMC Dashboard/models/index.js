'use strict';

// Barrel for the Sequelize models.
//
// Each model module exports a factory `(sequelize, DataTypes) => ModelClass`.
// From a controller / route, the canonical pattern is:
//
//     const { BrasRecord } = require('../models').init(sequelize, DataTypes);
//
// We keep this barrel side-effect-free (no implicit sequelize import) so the
// caller controls when the connection is established. The exported object
// exposes:
//   • `factories` — the raw list of { factory, name } for advanced callers
//   • `init(sequelize, DataTypes)` — returns a map of name → Model class

// Each entry is `{ factory, name }` so consumers can introspect.
// We use `getFactory` (added by models/BrasRecord.js) so the registry holds a
// pure function reference rather than going through the proxy.
const factories = [ { factory: require('./BrasRecord').getFactory, name: 'BrasRecord' } ];

// Top-level re-export so controllers can write
//   `const { BrasRecord } = require('../models');`
// against the lazy Proxy module without going through `.init(...)`.
const BrasRecord = require('./BrasRecord');

function initModels(sequelize, DataTypes) {
  const out = {};
  factories.forEach(function (entry) {
    const m = entry.factory(sequelize, DataTypes);
    out[entry.name] = m;
  });
  return out;
}

module.exports = {
  BrasRecord: BrasRecord,
  factories: factories,
  init: initModels,
};

// Callers that want a fully-initialized model registry do:
//
//     const { BrasRecord } = require('../models').init(sequelize);

