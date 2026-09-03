const fs = require('fs');
const os = require('os');
const path = require('path');
const { ensureDir, readJson, writeJson } = require('../../src/utils/fsUtils');

describe('filesystem JSON utilities', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'udemy-bot-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test('creates nested directories and writes readable JSON', () => {
    const filePath = path.join(tempDir, 'nested', 'state.json');
    const data = { page: 2, links: ['course-a'] };

    writeJson(filePath, data);

    expect(readJson(filePath)).toEqual(data);
  });

  test('returns the default for missing or malformed JSON', () => {
    const missingPath = path.join(tempDir, 'missing.json');
    const malformedPath = path.join(tempDir, 'malformed.json');
    fs.writeFileSync(malformedPath, '{invalid');

    expect(readJson(missingPath, { fallback: true })).toEqual({ fallback: true });
    expect(readJson(malformedPath, [])).toEqual([]);
  });

  test('uses the first valid fallback file', () => {
    const primaryPath = path.join(tempDir, 'primary.json');
    const invalidFallback = path.join(tempDir, 'invalid.json');
    const validFallback = path.join(tempDir, 'valid.json');
    fs.writeFileSync(invalidFallback, '{invalid');
    writeJson(validFallback, { source: 'fallback' });

    expect(readJson(primaryPath, null, [invalidFallback, validFallback]))
      .toEqual({ source: 'fallback' });
  });

  test('ensureDir is idempotent', () => {
    const nestedDir = path.join(tempDir, 'a', 'b');

    ensureDir(nestedDir);
    ensureDir(nestedDir);

    expect(fs.existsSync(nestedDir)).toBe(true);
  });
});