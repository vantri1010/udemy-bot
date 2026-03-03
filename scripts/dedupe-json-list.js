const fs = require('fs');
const path = require('path');

function parseArgs(argv) {
  const args = argv.slice(2);
  if (args.length < 1) {
    throw new Error('Usage: node scripts/dedupe-json-list.js <file> [arrayPath] [key] [--in-place]');
  }

  const file = args[0];
  const arrayPath = args[1] || '';
  const key = args[2] || '';
  const inPlace = args.includes('--in-place');
  return { file, arrayPath, key, inPlace };
}

function getAtPath(object, dotPath) {
  if (!dotPath) return object;
  return dotPath.split('.').reduce((acc, part) => {
    if (acc == null) return undefined;
    return acc[part];
  }, object);
}

function setAtPath(object, dotPath, value) {
  if (!dotPath) return value;
  const parts = dotPath.split('.');
  const result = Array.isArray(object) ? [...object] : { ...object };
  let cursor = result;

  for (let i = 0; i < parts.length - 1; i += 1) {
    const part = parts[i];
    const current = cursor[part];
    cursor[part] = Array.isArray(current) ? [...current] : { ...(current || {}) };
    cursor = cursor[part];
  }

  cursor[parts[parts.length - 1]] = value;
  return result;
}

function buildSignature(item, key) {
  if (key) {
    const value = item != null && typeof item === 'object' ? item[key] : undefined;
    return JSON.stringify(value);
  }
  return JSON.stringify(item);
}

function dedupeKeepFirst(list, key) {
  const seen = new Set();
  const result = [];

  for (const item of list) {
    const signature = buildSignature(item, key);
    if (seen.has(signature)) continue;
    seen.add(signature);
    result.push(item);
  }

  return result;
}

function main() {
  const { file, arrayPath, key, inPlace } = parseArgs(process.argv);
  const absoluteFile = path.resolve(process.cwd(), file);

  if (!fs.existsSync(absoluteFile)) {
    throw new Error(`File not found: ${absoluteFile}`);
  }

  const raw = fs.readFileSync(absoluteFile, 'utf-8');
  const parsed = JSON.parse(raw);
  const target = getAtPath(parsed, arrayPath);

  if (!Array.isArray(target)) {
    throw new Error('Target at arrayPath is not an array');
  }

  const deduped = dedupeKeepFirst(target, key);
  const removed = target.length - deduped.length;
  const updated = setAtPath(parsed, arrayPath, deduped);
  const output = `${JSON.stringify(updated, null, 2)}\n`;

  if (inPlace) {
    fs.writeFileSync(absoluteFile, output, 'utf-8');
    console.log(`Done. Removed ${removed} duplicate item(s). Updated: ${absoluteFile}`);
    return;
  }

  const dir = path.dirname(absoluteFile);
  const ext = path.extname(absoluteFile);
  const base = path.basename(absoluteFile, ext);
  const outFile = path.join(dir, `${base}.deduped${ext}`);
  fs.writeFileSync(outFile, output, 'utf-8');
  console.log(`Done. Removed ${removed} duplicate item(s). Output: ${outFile}`);
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}