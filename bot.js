// bot.js
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

const stealth = StealthPlugin();
stealth.enabledEvasions.delete('sourceurl'); // Fix ProtocolError
puppeteer.use(stealth);

const fs = require('fs');

// === PROFILE ===
const USER_DATA_DIR = "C:/Users/tris/AppData/Local/Google/Chrome/User Data";
const PROFILE_DIR = "Profile 1";

// === CẤU HÌNH ===
const sites = require('./sites.js');
const CHECKPOINT_FILE = 'checkpoint.json';
const MAX_PAGES = 2;

// === CHECKPOINT ===
let processed = new Set();
function loadCheckpoint() {
  if (fs.existsSync(CHECKPOINT_FILE)) {
    const data = JSON.parse(fs.readFileSync(CHECKPOINT_FILE, 'utf-8'));
    processed = new Set(data.processed || []);
    console.log(`Đã load ${processed.size} coupon từ checkpoint`);
  }
}
function saveCheckpoint() {
  fs.writeFileSync(CHECKPOINT_FILE, JSON.stringify({ processed: [...processed] }, null, 2));
}

// === NGỦ ===
function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// === HÀM CHÍNH ===
async function main() {
  console.log('Dùng profile thật → Bắt đầu quét coupon');

  const browser = await puppeteer.launch({
    headless: false,
    userDataDir: USER_DATA_DIR,
    defaultProfile: PROFILE_DIR,
    args: ['--no-sandbox', '--start-maximized'],
    defaultViewport: null
  });

  loadCheckpoint();
  const mainPage = (await browser.pages())[0];

  for (const site of sites) {
    const domain = new URL(site.url).hostname;
    console.log(`\n=== XỬ LÝ: ${domain} ===`);
    await handleSite(browser, mainPage, site);
  }

  console.log(`\nHOÀN THÀNH! Tổng: ${processed.size} coupon duy nhất`);
  saveCheckpoint();
  await browser.close();
}

// === XỬ LÝ SITE ===
async function handleSite(browser, mainPage, site) {
  const { url, type } = site;

  if (type === 'onlinecourses') {
    await extractOnlineCourses(browser, mainPage, url);
  } else if (type === 'inventhigh') {
    await extractInventHigh(browser, mainPage, url);
  } else if (type === 'freewebcart') {
    await extractFreeWebCart(browser, mainPage, url);
  }
}

// === 1. onlinecourses.ooo ===
async function extractOnlineCourses(browser, mainPage, baseUrl) {
  let currentPage = 1;

  while (currentPage <= MAX_PAGES) {
    const pageUrl = currentPage === 1 ? baseUrl : `${baseUrl.replace(/\/$/, '')}/page/${currentPage}/`;
    console.log(`\n--- Trang ${currentPage}: ${pageUrl} ---`);

    try {
      await mainPage.goto(pageUrl, { waitUntil: 'networkidle2', timeout: 60000 });
      await sleep(3000);
    } catch (e) {
      console.log(`Lỗi: ${e.message}`);
      break;
    }

    const detailLinks = await mainPage.evaluate(() => {
      return Array.from(document.querySelectorAll('a.re_track_btn'))
        .map(a => a.href)
        .filter(h => h && h.includes('/coupon/'));
    });

    if (detailLinks.length === 0) break;

    for (const link of detailLinks) {
      console.log(`  Vào: ${link.split('/').pop().slice(0, 50)}...`);
      const finalUrl = await resolveUrl(browser, link);
      if (finalUrl && !processed.has(finalUrl)) {
        processed.add(finalUrl);
        console.log(`    → COUPON: ${finalUrl.split('?')[0]}`);
        saveCheckpoint();
      }
    }

    currentPage++;
  }
}

// === 2. inventhigh.net ===
async function extractInventHigh(browser, mainPage, baseUrl) {
  await mainPage.goto(baseUrl, { waitUntil: 'networkidle2', timeout: 60000 });
  await sleep(4000);

  const latestBtn = await mainPage.$('a[data-filter="latest"]');
  if (latestBtn) await latestBtn.click();
  await sleep(3000);

  let pageNum = 1;
  while (pageNum <= MAX_PAGES) {
    console.log(`\n--- Trang ${pageNum} (InventHigh) ---`);

    const hrefs = await mainPage.evaluate(() => {
      return Array.from(document.querySelectorAll('a.btn.btnmain'))
        .map(a => a.href)
        .filter(h => h.includes('couponCode='));
    });

    for (const href of hrefs) {
      const finalUrl = await resolveUrl(browser, href);
      if (finalUrl && !processed.has(finalUrl)) {
        processed.add(finalUrl);
        console.log(`  → COUPON: ${finalUrl.split('?')[0]}`);
        saveCheckpoint();
      } else {
        console.log(`  → ĐÃ CÓ (trùng)`);
      }
    }

    const nextBtn = await mainPage.$(`a.pagination-link[data-page="${pageNum + 1}"]`);
    if (!nextBtn) break;
    await nextBtn.click();
    await sleep(3000);
    pageNum++;
  }
}

// === 3. freewebcart.com ===
async function extractFreeWebCart(browser, mainPage, baseUrl) {
  await mainPage.goto(baseUrl, { waitUntil: 'networkidle2', timeout: 60000 });
  await sleep(8000);

  // ĐÓNG POPUP
  const closeBtn = await mainPage.$('button.close, .modal-close, [aria-label="close"], .ads-close');
  if (closeBtn) {
    await closeBtn.click();
    console.log("Đã đóng quảng cáo popup");
    await sleep(2000);
  }

  let processedCount = 0;
  let loadCount = 0;

  while (loadCount < MAX_PAGES) {
    console.log(`\n--- Load More ${loadCount + 1} (FreeWebCart) ---`);

    // RELOAD DANH SÁCH MỚI NHẤT
    await mainPage.waitForSelector('a.course-card-link', { timeout: 10000 });
    const allLinks = await mainPage.$$('a.course-card-link');
    const totalLinks = allLinks.length;

    if (totalLinks <= processedCount) {
      console.log("Không có item mới → dừng");
      break;
    }

    console.log(`Tổng: ${totalLinks} item → xử lý từ ${processedCount} đến ${totalLinks - 1}`);

    const newLinks = allLinks.slice(processedCount);

    for (const link of newLinks) {
      const href = await link.evaluate(el => el.href);
      console.log(`  Vào: ${href.split('/course/')[1]?.slice(0, 50)}...`);

      const detailPage = await browser.newPage();
      try {
        await detailPage.goto(href, { waitUntil: 'networkidle2', timeout: 30000 });
        await sleep(3000);

        const enrollBtn = await detailPage.$('a.detail-enroll-btn');
        if (enrollBtn) {
          const trackingUrl = await enrollBtn.evaluate(el => el.href);
          const finalUrl = await resolveUrl(browser, trackingUrl);
          if (finalUrl && !processed.has(finalUrl)) {
            processed.add(finalUrl);
            console.log(`    → COUPON: ${finalUrl.split('?')[0]}`);
            saveCheckpoint();
          }
        }
      } catch (e) {
        console.log(`  Lỗi: ${e.message}`);
      } finally {
        await detailPage.close();
      }
    }

    processedCount = totalLinks;

    // BẤM LOAD MORE
    const loadMore = await mainPage.$('button.btn-load-more');
    if (!loadMore) {
      console.log("Không còn nút Load More");
      break;
    }

    await loadMore.click();
    await sleep(6000); // Tăng thời gian chờ load
    loadCount++;
  }
}

// === HÀM GIẢI TRACKING LINK ===
async function resolveUrl(browser, url) {
  if (!url.includes('trk.udemy.com') && url.includes('udemy.com') && url.includes('couponCode=')) {
    return url;
  }

  const page = await browser.newPage();
  try {
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
    const final = page.url();
    return final.includes('udemy.com') && final.includes('couponCode=') ? cleanUdemyLink(final) : null;
  } catch (e) {
    return null;
  } finally {
    await page.close();
  }
}

// === HÀM LÀM SẠCH LINK (ĐỒNG BỘ NGẮN) ===
function cleanUdemyLink(href) {
  if (!href.includes('udemy.com')) return null;

  const url = new URL(href);
  const path = url.pathname;
  const params = url.searchParams;
  const coupon = params.get('couponCode');
  if (!coupon) return null;

  // Rebuild ngắn: https://www.udemy.com/path/?couponCode=XYZ
  return `https://www.udemy.com${path}?couponCode=${coupon}`;
}

// === CHẠY ===
main().catch(err => {
  console.error('Lỗi:', err);
  process.exit(1);
});