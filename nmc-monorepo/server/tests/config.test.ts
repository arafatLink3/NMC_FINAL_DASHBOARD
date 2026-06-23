import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadConfig,
  _resetConfigForTests,
} from '../src/config.js';

describe('config loader', () => {
  beforeEach(() => _resetConfigForTests());

  it('applies defaults when env is empty', () => {
    const cfg = loadConfig({});
    expect(cfg.NODE_ENV).toBe('development');
    expect(cfg.PORT).toBe(4000);
    expect(cfg.DB_CLIENT).toBe('sqlite');
    expect(cfg.OTEL_ENABLED).toBe(false);
    expect(cfg.UPLOAD_MAX_BYTES).toBeGreaterThan(0);
  });

  it('coerces numeric env strings', () => {
    _resetConfigForTests();
    const cfg = loadConfig({ PORT: '5050', UPLOAD_MAX_BYTES: '1024' });
    expect(cfg.PORT).toBe(5050);
    expect(cfg.UPLOAD_MAX_BYTES).toBe(1024);
  });

  it('rejects an invalid DB client', () => {
    _resetConfigForTests();
    expect(() => loadConfig({ DB_CLIENT: 'oracle' })).toThrow();
  });

  it('parses OTEL boolean strings', () => {
    _resetConfigForTests();
    expect(loadConfig({ OTEL_ENABLED: 'true' }).OTEL_ENABLED).toBe(true);
    _resetConfigForTests();
    expect(loadConfig({ OTEL_ENABLED: '0' }).OTEL_ENABLED).toBe(false);
  });
});
