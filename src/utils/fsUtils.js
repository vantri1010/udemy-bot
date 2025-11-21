const fs = require('fs');
const path = require('path');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function readJson(filePath, defaultValue = null, fallbackPaths = []) {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    }
  } catch (_) {}

  for (const fb of fallbackPaths) {
    try {
      if (fs.existsSync(fb)) {
        return JSON.parse(fs.readFileSync(fb, 'utf-8'));
      }
    } catch (_) {}
  }
  return defaultValue;
}

function writeJson(filePath, data) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

module.exports = { ensureDir, readJson, writeJson };
