const path = require('path');
const fs = require('fs');

const ROOT_DIR = path.resolve(__dirname, '../../');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const OUTPUT_DIR = path.join(DATA_DIR, 'output');
const COOKIES_DIR = path.join(DATA_DIR, 'cookies');
const CACHE_DIR = path.join(DATA_DIR, 'cache');
const LOGS_DIR = path.join(ROOT_DIR, 'logs');

// Ensure directories exist
[DATA_DIR, OUTPUT_DIR, COOKIES_DIR, CACHE_DIR, LOGS_DIR].forEach((dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

module.exports = {
  ROOT_DIR,
  DATA_DIR,
  OUTPUT_DIR,
  COOKIES_DIR,
  CACHE_DIR,
  LOGS_DIR,
  FILES: {
    CHECKPOINT: path.join(DATA_DIR, 'checkpoint.json'),
    TO_CHECKOUT: path.join(OUTPUT_DIR, 'to_checkout.json'),
    UDEMY_COOKIES: path.join(COOKIES_DIR, 'udemy_cookies.json'),
    UDEMY_PURCHASED: path.join(CACHE_DIR, 'udemy_purchased.json'),
  },
};
