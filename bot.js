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


async function main() {
  console.log('Dùng profile thật ➡ Bắt đầu quét coupon');

  const browser = await puppeteer.launch({
    headless: false, // set to true if you don't need to see the browser
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

  await Promise.all(
    sites.map(async (site) => {
      const page = await browser.newPage();
      try {
        const { url, type, maxPages } = site;
        const domain = new URL(url).hostname;
        console.log(`\n=== XỬ LÝ: ${domain} ===`);
        
        if (type === 'onlinecourses') {
          await extractOnlineCourses(browser, page, url, checkpoint, maxPages);
        } else if (type === 'inventhigh') {
          await extractInventHigh(page, url, checkpoint, maxPages);
        } else if (type === 'freewebcart') {
          await extractFreeWebCart(browser, page, url, checkpoint, maxPages);
        } else if (type === 'discudemy') {
          await extractDiscUdemy(browser, page, url, checkpoint, maxPages);
        }
      } finally {
        await page.close();
      }
    })
  );

  console.log(`\n🛒 HOÀN THÀNH! Tổng: ${checkpoint.processed.size} coupon duy nhất`);
  checkpoint.save();
  await browser.close();
}

main().catch(err => {
  console.error('Lỗi:', err);
  process.exit(1);
});