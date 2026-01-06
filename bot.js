// bot.js (CLI entry)
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

const stealth = StealthPlugin();
stealth.enabledEvasions.delete('sourceurl');
puppeteer.use(stealth);

const { USER_DATA_DIR, PROFILE_DIR } = require('./src/config/browser');
const sites = require('./src/config/sites');
const { Checkpoint } = require('./src/scrape/prcsdCrsHandler');
const { extractOnlineCourses } = require('./src/scrape/onlinecourses');
const { extractInventHigh } = require('./src/scrape/inventhigh');
const { extractFreeWebCart } = require('./src/scrape/freewebcart');
const { extractDiscUdemy } = require('./src/scrape/discudemy');

// Parse CLI arguments
const args = process.argv.slice(2);
const parallel = args.includes('--parallel') || args.includes('-p');

// Parse concurrent detail pages flag (default to 1)
let detailConcurrency = 1;
const concurrencyArg = args.find(arg => arg.startsWith('--details='));
if (concurrencyArg) {
  const value = parseInt(concurrencyArg.split('=')[1], 10);
  detailConcurrency = isNaN(value) || value < 1 ? 3 : value;
}


async function main() {
  console.log('Dùng profile thật ➡ Bắt đầu quét coupon');
  console.log(`Chế độ: ${parallel ? 'SONG SONG (Parallel)' : 'TUẦN TỰ (Sequential)'}`);
  console.log(`Concurrent detail pages: ${detailConcurrency}\n`);

  const browser = await puppeteer.launch({
    headless: false, // set to true if you don't need to see the browser
    // Increase CDP protocol timeout to reduce Runtime.callFunctionOn timeouts
    protocolTimeout: 120000,
    userDataDir: USER_DATA_DIR,
    defaultProfile: PROFILE_DIR,
    args: [
      '--no-sandbox',
      '--start-maximized', // turn off if headless true
      '--disable-blink-features=AutomationControlled',
      '--disable-dev-shm-usage'
    ],
    defaultViewport: null
  });

  const checkpoint = new Checkpoint();
  checkpoint.load();

  // Helper function to process a single site
  async function processSite(site) {
    const page = await browser.newPage();
    try {
      const { url, type, maxPages } = site;
      const domain = new URL(url).hostname;
      console.log(`\n=== XỬ LÝ: ${domain} ===`);
      
      if (type === 'onlinecourses') {
        await extractOnlineCourses(browser, page, url, checkpoint, maxPages, detailConcurrency);
      } else if (type === 'inventhigh') {
        await extractInventHigh(page, url, checkpoint, maxPages);
      } else if (type === 'freewebcart') {
        await extractFreeWebCart(browser, page, url, checkpoint, maxPages, detailConcurrency);
      } else if (type === 'couponami') {
        await extractDiscUdemy(browser, page, url, checkpoint, maxPages, detailConcurrency);
      }
    } finally {
      await page.close();
    }
  }

  // Run sites in parallel or sequential based on flag
  if (parallel) {
    await Promise.all(sites.map(site => processSite(site)));
  } else {
    for (const site of sites) {
      await processSite(site);
    }
  }

  console.log(`\n🛒 HOÀN THÀNH! Tổng: ${checkpoint.processed.size} coupon duy nhất`);
  checkpoint.save();
  await browser.close();
}

main().catch(err => {
  console.error('Lỗi:', err);
  process.exit(1);
});