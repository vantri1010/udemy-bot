// fetch_and_check.js (CLI entry)
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { readJson, writeJson } = require('./src/utils/fsUtils');

const { USER_DATA_DIR, PROFILE_DIR } = require('./src/config/browser');
const { FILES } = require('./src/config/paths');
const { ensureUdemyLogin } = require('./src/udemy/auth');
const { fetchPurchasedCourses } = require('./src/udemy/purchased');
const { isFreeCourse } = require('./src/udemy/priceCheck');
const { normalizeUrl, extractCourseName } = require('./src/utils/url');
const { Checkpoint } = require('./src/scrape/prcsdCrsHandler');

puppeteer.use(StealthPlugin());

async function main() {
  console.log('🚀 Starting course checker - filtering unpurchased courses...');

  const shouldAddToCart = process.argv.includes('--add-to-cart') || process.argv.includes('-a');
  console.log(shouldAddToCart
    ? '🛒 Add-to-cart enabled via CLI flag'
    : '🔒 Add-to-cart disabled (default)');

  const browser = await puppeteer.launch({
    headless: false, // set to true if you don't need to see the browser
    userDataDir: USER_DATA_DIR,
    args: [
      '--no-sandbox',
      `--profile-directory=${PROFILE_DIR}`,
      '--disable-blink-features=AutomationControlled',
      '--disable-dev-shm-usage'
    ],
    defaultViewport: null,
  });

  try {
    await ensureUdemyLogin(browser);
    let purchased;
    try {
      purchased = await fetchPurchasedCourses(browser, { MAX_RETRIES: 5, BASE_DELAY: 500, PAGE_SIZE: 100 });
    } catch (err) {
      const cached = readJson(FILES.UDEMY_PURCHASED, null);
      purchased = Array.isArray(cached?.purchdLinks) ? cached.purchdLinks : [];
      console.log(`⚠ Could not fetch purchased courses: ${err.message}`);
      console.log(`▶ Continuing with ${purchased.length} cached purchased courses`);
    }
    const purchasedSet = new Set(purchased.map((c) => normalizeUrl(c.url)));

    console.log(`\nℹ Found ${purchasedSet.size} purchased courses to filter`);

    const checkpoint = new Checkpoint();
    checkpoint.load();
    const links = checkpoint.getUrls() || [];
    let startIndex = checkpoint.getLastProcessedIndex() + 1;

    console.log(`📋 Processing ${links.length} links starting from index ${startIndex}...`);

    const results = [];
    for (let i = startIndex; i < links.length; i++) {
      const link = links[i];
      const courseName = extractCourseName(link);
      const normalizedUrl = normalizeUrl(link);

      console.log(`[${i + 1}/${links.length}] Checking: ${courseName}`);
      const verifyTimeout = 30000 + (i+1) * 15000;

      if (purchasedSet.has(normalizedUrl)) {
        console.log('  ✓ Already purchased - skipping');
      } else {
        const free = await isFreeCourse(browser, link, verifyTimeout, { addToCart: shouldAddToCart });
        if (free.isFree) {
          console.log('  💚 Free course available!');
          results.push(link);
        } else {
          console.log('  ⚫ Course expired or paid');
        }
      }

      checkpoint.setLastProcessedIndex(i);
    }
    checkpoint.save();

    const uniqueResults = [...new Set(results)].sort();
    writeJson(FILES.TO_CHECKOUT, uniqueResults);

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
