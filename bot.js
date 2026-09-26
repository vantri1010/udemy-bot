// bot.js (CLI entry)
const { connect } = require('puppeteer-real-browser');

const { USER_DATA_DIR, PROFILE_DIR } = require('./src/config/browser');
const sites = require('./src/config/sites');
const { Checkpoint } = require('./src/scrape/prcsdCrsHandler');
// const { extractOnlineCourses } = require('./src/scrape/onlinecourses');
// const { extractInventHigh } = require('./src/scrape/inventhigh');
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

  const { browser } = await connect({
    headless: false, // set to true if you don't need to see the browser
    // Increase CDP protocol timeout to reduce Runtime.callFunctionOn timeouts
    protocolTimeout: 120000,
    args: [
      '--no-sandbox',
      `--profile-directory=${PROFILE_DIR}`,
      '--start-maximized', // turn off if headless true
      '--disable-blink-features=AutomationControlled',
      '--disable-dev-shm-usage',
      '--disable-cache',
      '--disable-background-timer-throttling',
      '--disable-features=IsolateOrigins,site-per-process',
      '--disable-site-isolation-trials',
      '--disable-web-security',
      '--disable-features=VizDisplayCompositor',
      '--disable-features=VizDisplayCompositor',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-default-apps',
      '--disable-extensions',
      '--disable-sync',
      '--disable-translate',
      '--hide-scrollbars',
      '--mute-audio',
      '--no-proxy-server',
      '--disable-background-networking',
      '--disable-component-update',
      '--disable-domain-reliability',
      '--disable-features=AudioServiceOutOfProcess',
      '--disable-ipc-flooding-protection'
    ],
    ignoreDefaultArgs: ['--enable-automation'],
    userDataDir: USER_DATA_DIR,
    turnstile: true, // Enable Turnstile CAPTCHA solving
    customConfig: {
      // Add realistic browser properties
      'navigator.webdriver': undefined,
      'navigator.languages': ['en-US', 'en'],
      'navigator.platform': 'Win32',
      'navigator.maxTouchPoints': 0,
      'navigator.hardwareConcurrency': 8,
      'navigator.deviceMemory': 8,
      'screen.width': 1920,
      'screen.height': 1080,
      'screen.availWidth': 1920,
      'screen.availHeight': 1040,
      'screen.colorDepth': 24
    },
    connectOption: {
      // Additional connection options
      timeout: 120000
    }
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
      } else if (type === 'discudemy') {
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

  const pages = await browser.pages();
  await Promise.all(
    pages.map(page => page.close().catch(() => {}))
  );

  await browser.close();
}

main().catch(err => {
  console.error('Lỗi:', err);
  process.exit(1);
});