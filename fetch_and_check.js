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

// Parse CLI arguments
const args = process.argv.slice(2);
const shouldAddToCart = args.includes('--add-to-cart') || args.includes('-a');
const parallel = args.includes('--parallel') || args.includes('-p');

// Parse concurrent detail pages flag (default to 1)
let detailConcurrency = 1;
const concurrencyArg = args.find(arg => arg.startsWith('--details='));
if (concurrencyArg) {
  const value = parseInt(concurrencyArg.split('=')[1], 10);
  detailConcurrency = isNaN(value) || value < 1 ? 3 : value;
}

async function main() {
  console.log('🚀 Starting course checker - filtering unpurchased courses...');
  console.log(`Chế độ: ${parallel ? 'SONG SONG (Parallel)' : 'TUẦN TỰ (Sequential)'}`);
  console.log(`Concurrent detail pages: ${detailConcurrency}`);
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

    // Helper function to process a single course
    async function processCourse(link, index) {
      const courseName = extractCourseName(link);
      const normalizedUrl = normalizeUrl(link);

      console.log(`[${index + 1}/${links.length}] Checking: ${courseName}`);
      const verifyTimeout = 30000;

      try {
        if (purchasedSet.has(normalizedUrl)) {
          console.log('  ✓ Already purchased - skipping');
          return null;
        }

        const free = await isFreeCourse(browser, link, verifyTimeout, { addToCart: shouldAddToCart, detailConcurrency });
        if (free.type === 'COURSE_NOT_FOUND') {
          console.log('  ⚫ Course no longer exists - skipping');
          return null;
        } else if (free.type === 'UNSUPPORTED_LANGUAGE') {
          console.log('  🤷 Unsupported language - skipping');
          return null;
        } else if (free.isFree) {
          console.log('  💚 Free course available!');
          return link;
        } else {
          console.log('  ⚫ Course expired or paid');
          return null;
        }
      } catch (err) {
        console.log(`  ❌ Unexpected error, skipping course: ${err.message}`);
        return null;
      }
    }

    // Process courses in parallel or sequential based on flag
    if (parallel) {
      // Create a concurrency-limited parallel processor
      async function processWithConcurrency(items, concurrency, processFn) {
        const results = [];
        const executing = [];

        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          const index = startIndex + i;

          const promise = Promise.resolve().then(() => processFn(item, index)).then(result => {
            executing.splice(executing.indexOf(promise), 1);
            return result;
          });

          results.push(promise);
          executing.push(promise);

          if (executing.length >= concurrency) {
            await Promise.race(executing);
          }
        }

        return Promise.all(results);
      }

      const processedResults = await processWithConcurrency(
        links.slice(startIndex),
        detailConcurrency,
        processCourse
      );
      results.push(...processedResults.filter(r => r !== null));
      // Update checkpoint for entire batch in parallel mode
      checkpoint.setLastProcessedIndex(links.length - 1);
    } else {
      for (let i = startIndex; i < links.length; i++) {
        const link = links[i];
        const result = await processCourse(link, i);
        if (result !== null) {
          results.push(result);
        }
        checkpoint.setLastProcessedIndex(i);
        checkpoint.save();
      }
    }

    // Save checkpoint in parallel mode
    if (parallel) {
      checkpoint.save();
    }

    const uniqueResults = [...new Set(results)].sort();
    writeJson(FILES.TO_CHECKOUT, uniqueResults);

    console.log(`\n✅ COMPLETED!`);
    console.log(`💰 Found ${uniqueResults.length} free courses available`);
    console.log(`📄 Results saved to: ${FILES.TO_CHECKOUT}`);
  } finally {
    const pages = await browser.pages();
    await Promise.all(
      pages.map(page => page.close().catch(() => {}))
    );
    await browser.close().catch((err) => console.log(`⚠ Browser close error: ${err.message}`));
  }
}

main().catch((err) => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});