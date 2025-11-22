// fetch_and_check.js (CLI entry)
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const { readJson } = require('./src/utils/fsUtils');

const { USER_DATA_DIR, PROFILE_DIR } = require('./src/config/browser');
const { FILES } = require('./src/config/paths');
const { ensureUdemyLogin } = require('./src/udemy/auth');
const { fetchPurchasedCourses } = require('./src/udemy/purchased');
const { isFreeCourse } = require('./src/udemy/priceCheck');
const { normalizeUrl, extractCourseName } = require('./src/utils/url');

puppeteer.use(StealthPlugin());

function updateCheckpointProgress(index) {
  try {
    const checkpoint = readJson(FILES.CHECKPOINT, { processed: [], lastProcessedIndex: -1 }, ['checkpoint.json']);
    checkpoint.lastProcessedIndex = index;
    fs.writeFileSync(FILES.CHECKPOINT, JSON.stringify(checkpoint, null, 2));
  } catch (err) {
    console.log(`⚠ Cannot update checkpoint: ${err.message}`);
  }
}

async function main() {
  console.log('🚀 Starting course checker - filtering unpurchased courses...');

  const browser = await puppeteer.launch({
    headless: false,
    userDataDir: USER_DATA_DIR,
    defaultProfile: PROFILE_DIR,
    args: ['--no-sandbox', '--start-maximized'],
    defaultViewport: null,
  });

  try {
    await ensureUdemyLogin(browser);
    const purchased = await fetchPurchasedCourses(browser, { MAX_RETRIES: 5, BASE_DELAY: 500, PAGE_SIZE: 100 });
    const purchasedSet = new Set(purchased.map((c) => normalizeUrl(c.url)));

    console.log(`\nℹ Found ${purchasedSet.size} purchased courses to filter`);

    const checkpoint = readJson(FILES.CHECKPOINT, { processed: [], lastProcessedIndex: -1 }, ['checkpoint.json']);
    const links = checkpoint.processed || [];
    let startIndex = (typeof checkpoint.lastProcessedIndex === "number" ? checkpoint.lastProcessedIndex : -1) + 1;

    console.log(`📋 Processing ${links.length} links starting from index ${startIndex}...`);

    const results = [];
    for (let i = startIndex; i < links.length; i++) {
      const link = links[i];
      const courseName = extractCourseName(link);
      const normalizedUrl = normalizeUrl(link);

      console.log(`[${i + 1}/${links.length}] Checking: ${courseName}`);

      if (purchasedSet.has(normalizedUrl)) {
        console.log('  ✓ Already purchased - skipping');
      } else {
        const free = await isFreeCourse(browser, link, { timeout: 15000 });
        if (free) {
          console.log('  💚 Free course available!');
          results.push(link);
        } else {
          console.log('  ⚫ Course expired or paid');
        }
      }

      updateCheckpointProgress(i);
    }

    const uniqueResults = [...new Set(results)].sort();
    fs.writeFileSync(FILES.TO_CHECKOUT, JSON.stringify(uniqueResults, null, 2));

    console.log(`\n✅ COMPLETED!`);
    console.log(`💰 Found ${uniqueResults.length} free courses available`);
    console.log(`📄 Results saved to: ${FILES.TO_CHECKOUT}`);
  } finally {
    await browser.close().catch((err) => console.log(`⚠ Browser close error: ${err.message}`));
  }
}

main().catch((err) => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});
