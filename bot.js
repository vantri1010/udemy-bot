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

const MAX_PAGES = 10;

async function main() {
  console.log('Dùng profile thật ➡ Bắt đầu quét coupon');

  const browser = await puppeteer.launch({
    headless: false,
    userDataDir: USER_DATA_DIR,
    defaultProfile: PROFILE_DIR,
    args: [
      '--no-sandbox',
      '--start-maximized',
      '--disable-blink-features=AutomationControlled',
      '--disable-dev-shm-usage'
    ],
    defaultViewport: null
  });

  const checkpoint = new Checkpoint();
  checkpoint.load();

  const mainPage = (await browser.pages())[0];

  for (const site of sites) {
    const domain = new URL(site.url).hostname;
    console.log(`\n=== XỬ LÝ: ${domain} ===`);
    const { url, type } = site;
    if (type === 'onlinecourses') {
      await extractOnlineCourses(browser, mainPage, url, checkpoint, MAX_PAGES);
    } else if (type === 'inventhigh') {
      await extractInventHigh(mainPage, url, checkpoint, MAX_PAGES);
    } else if (type === 'freewebcart') {
      await extractFreeWebCart(browser, mainPage, url, checkpoint, MAX_PAGES);
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