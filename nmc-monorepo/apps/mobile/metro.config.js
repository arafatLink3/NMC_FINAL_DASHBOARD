/**
 * Metro config for the Expo mobile app.
 *
 * The mobile app lives in a pnpm monorepo. Metro must be told to:
 *   1. Watch the monorepo root (so edits to `@nmc/ui` or `@nmc/api-client`
 *      are picked up without restarting Expo).
 *   2. Resolve modules from the monorepo's `node_modules` (pnpm hoist is
 *      non-default — packages live under `node_modules/.pnpm/...`).
 *   3. Honour the standard `react-native` and `react-native-web` peer
 *      resolution (so `@nmc/ui` platform resolution works).
 */
const { getDefaultConfig } = require('expo/metro-config');
const path = require('node:path');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// 1. Watch the entire monorepo.
config.watchFolders = [monorepoRoot];

// 2. Let Metro find packages hoisted by pnpm at the monorepo root.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];

// 3. Make sure platform-specific entry points in `@nmc/ui`
//    (`platform.native.ts` vs `platform.web.ts`) resolve correctly.
config.resolver.platforms = ['ios', 'android', 'web', 'native'];

// 4. Keep Metro's default transformer; Expo's babel preset handles JSX/TS.
config.resolver.sourceExts = Array.from(
  new Set([...(config.resolver.sourceExts ?? []), 'cjs', 'mjs']),
);

module.exports = config;