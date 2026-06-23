// Native entry. Re-exports the shared platform module. The bundler will pick
// this file when the consumer sets `react-native` field in package.json to
// point at `./dist/platform.native.js`. Until then, this file is dead code
// on disk — keep it in sync with `platform.ts`.
export * from './platform.js';
