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
const MAX_PAGES = 7;

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
  try {
    let data = {};
    if (fs.existsSync(CHECKPOINT_FILE)) {
      try {
        data = JSON.parse(fs.readFileSync(CHECKPOINT_FILE, 'utf-8')) || {};
      } catch (_) {
        data = {};
      }
    }
    data.processed = [...processed];
    fs.writeFileSync(CHECKPOINT_FILE, JSON.stringify(data, null, 2));
  } catch (err) {
    console.log(`Không thể lưu ${CHECKPOINT_FILE}: ${err.message}`);
  }
}

// === NGỦ ===
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// === HÀM CHÍNH ===
async function main() {
  console.log('Dùng profile thật → Bắt đầu quét coupon');

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
  if (type === 'onlinecourses') await extractOnlineCourses(browser, mainPage, url);
  else if (type === 'inventhigh') await extractInventHigh(mainPage, url);
  else if (type === 'freewebcart') await extractFreeWebCart(browser, mainPage, url);
}

// === 1. onlinecourses.ooo ===
async function extractOnlineCourses(browser, mainPage, baseUrl) {
  let currentPage = 9;
  const MAX_RETRIES = 3;

  while (currentPage <= MAX_PAGES) {
    const pageUrl = currentPage === 1 ? baseUrl : `${baseUrl.replace(/\/$/, '')}/page/${currentPage}/`;
    console.log(`\n--- Trang ${currentPage}: ${pageUrl} ---`);

    let pageLoaded = false;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        // Apply anti-detection on each navigation
        await mainPage.goto(pageUrl, { waitUntil: 'networkidle2', timeout: 60000 });
        pageLoaded = true;
        break; // Success
      } catch (e) {
        const backoff = Math.pow(2, attempt - 1) * 2000;
        console.log(`Attempt ${attempt} failed: ${e.message}. Retrying in ${backoff}ms...`);
        await sleep(backoff);
      }
    }

    if (!pageLoaded) {
      console.log(`Không thể load trang ${currentPage} sau ${MAX_RETRIES} lần thử`);
      break;
    }

    await sleep(5000);

    // === 2. Lấy link chi tiết ===
    const detailLinks = await mainPage.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a.re_track_btn'))
      .map(a => a.href)
      .filter(h => h.includes('https://www.onlinecourses.ooo/coupon/'));
      return Array.from(new Set(links)); // remove duplicates, preserve order
    });

    console.log(`Tìm thấy ${detailLinks.length} trang chi tiết`);
    if (!detailLinks.length) break;

    for (const href of detailLinks) {
      console.log(`  Vào: ${href.split('/coupon/')[1]?.slice(0, 50)}...`);

      const detailPage = await browser.newPage();
      try {
        pageLoaded = false;

        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
          try {
            // Apply anti-detection on each navigation
            await detailPage.goto(href, { waitUntil: 'networkidle2', timeout: 60000 });
            pageLoaded = true;
            break; // Success
          } catch (e) {
            const backoff = Math.pow(2, attempt - 1) * 2000;
            console.log(`Attempt ${attempt} failed: ${e.message}. Retrying in ${backoff}ms...`);
            await sleep(backoff);
          }
        }

        if (!pageLoaded) {
          console.log(`Không thể load trang ${currentPage} sau ${MAX_RETRIES} lần thử`);
          break;
        }
        await sleep(3000);

        const enrollBtn = await detailPage.$('a.re_track_btn');
        if (enrollBtn) {
          const trackingUrl = await enrollBtn.evaluate(el => el.href);
          const finalUrl = await cleanUdemyLink(trackingUrl);
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

    currentPage++;
  }
}

// === 2. inventhigh.net (TỐI ƯU: KHÔNG MỞ TAB) ===
async function extractInventHigh(mainPage, baseUrl) {
  await mainPage.goto(baseUrl, { waitUntil: 'networkidle2', timeout: 60000 });
  await sleep(4000);

  const latestBtn = await mainPage.$('a[data-filter="latest"]');
  if (latestBtn) await latestBtn.click();
  await sleep(3000);

  let pageNum = 1;
  while (pageNum <= MAX_PAGES) {
    console.log(`\n--- Trang ${pageNum} (InventHigh) ---`);

    const hrefs = await mainPage.evaluate(() => 
      Array.from(document.querySelectorAll('a.btn.btnmain'))
        .map(a => a.href)
        .filter(h => h.includes('trk.udemy.com'))
    );

    for (const href of hrefs) {
      const cleanLink = extractUdemyFromTrk(href);
      if (cleanLink && !processed.has(cleanLink)) {
        processed.add(cleanLink);
        console.log(`  → COUPON: ${cleanLink.split('?')[0]}`);
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
  await sleep(4000);

  // ĐÓNG POPUP (cố gắng nhiều lần)
  for (let i = 0; i < 5; i++) {
    const closeBtn = await mainPage.$('button.close, .modal-close, [aria-label="close"], .ads-close, .popup-close');
    if (closeBtn) {
      try { await closeBtn.click(); await sleep(1000); } catch {}
    } else break;
  }

  let processedCount = 0;
  let loadCount = 0;
  let noNewItemCount = 0; // Đếm lần không có item mới → tránh loop vô hạn

  while (loadCount < MAX_PAGES && noNewItemCount < 3) {
    console.log(`\n--- Load More ${loadCount + 1} (FreeWebCart) ---`);

    // ĐỢI CHO ĐỦ ITEM MỚI XUẤT HIỆN (CHỐNG DỪNG SAI)
    try {
      await mainPage.waitForFunction(
        (expected) => {
          const links = document.querySelectorAll('a.course-card-link, .course-card a');
          return links.length > expected;
        },
        { timeout: 20000 },
        processedCount
      );
      console.log("Đã phát hiện item mới → tiếp tục");
    } catch (e) {
      console.log("Không thấy item mới sau 20s → thử scroll + đợi thêm...");
      await mainPage.evaluate(() => window.scrollBy(0, 800));
      await sleep(2000);

      // Thử lại lần cuối
      const currentCount = await mainPage.evaluate(() => 
        document.querySelectorAll('a.course-card-link, .course-card a').length
      );

      if (currentCount <= processedCount) {
        noNewItemCount++;
        console.log(`Không có item mới (lần ${noNewItemCount}/3) → có thể hết`);
        if (noNewItemCount >= 3) {
          console.log("Đã thử 3 lần không có item mới → dừng hẳn");
          break;
        }
        // Vẫn bấm Load More để thử lần cuối
      } else {
        noNewItemCount = 0; // Có item mới → reset đếm
      }
    }

    // LẤY DANH SÁCH MỚI NHẤT (dùng selector mạnh hơn)
    await sleep(2000);
    const allLinks = await mainPage.$$('a.course-card-link, .course-card a');
    const totalLinks = allLinks.length;

    console.log(`Tổng hiện tại: ${totalLinks} item (đã xử lý: ${processedCount})`);

    if (totalLinks <= processedCount) {
      console.log("Không có item mới thực sự → chuẩn bị dừng");
      noNewItemCount++;
      if (noNewItemCount >= 3) break;
    } else {
      noNewItemCount = 0; // Có item mới → reset
    }

    const newLinks = allLinks.slice(processedCount);
    console.log(`→ Xử lý ${newLinks.length} item mới`);

    for (const link of newLinks) {
      const href = await link.evaluate(el => el.href || el.closest('a')?.href).catch(() => null);
      if (!href || !href.includes('/course/')) continue;

      console.log(`  Vào: ${href.split('/course/')[1]?.slice(0, 50)}...`);

      const detailPage = await browser.newPage();
      try {
        await detailPage.goto(href, { waitUntil: 'networkidle2', timeout: 30000 });
        await sleep(2000);

        const enrollBtn = await detailPage.$('a.detail-enroll-btn, a[href*="udemy.com"]');
        if (enrollBtn) {
          const trackingUrl = await enrollBtn.evaluate(el => el.href);
          const finalUrl = await resolveTrackingUrl(browser, trackingUrl);
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

    // BẤM LOAD MORE (cố gắng nhiều selector)
    const loadMore = await mainPage.$('button.btn-load-more, .load-more button, [onclick*="loadMore"]');
    if (!loadMore) {
      console.log("Không tìm thấy nút Load More → dừng");
      break;
    }

    await loadMore.click();
    await sleep(2000); // Tăng thời gian chờ load
    loadCount++;
  }

  console.log(`FreeWebCart: Hoàn thành – xử lý ${processedCount} khóa học`);
}

// === HÀM GIẢI TRACKING (CHỈ DÙNG CHO onlinecourses & freewebcart) ===
async function resolveTrackingUrl(browser, url) {
  if (url.includes('udemy.com') && url.includes('couponCode=')) {
    return cleanUdemyLink(url);
  }

  const page = await browser.newPage();
  try {
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
    const final = page.url();
    return final.includes('udemy.com') && final.includes('couponCode=') ? cleanUdemyLink(final) : null;
  } catch {
    return null;
  } finally {
    await page.close();
  }
}

// === HÀM LẤY LINK NGẮN TỪ TRK (DÀNH RIÊNG inventhigh) ===
function extractUdemyFromTrk(trkUrl) {
  try {
    const url = new URL(trkUrl);
    const u = url.searchParams.get('u');
    if (!u) return null;
    const decoded = decodeURIComponent(u);
    return cleanUdemyLink(decoded);
  } catch {
    return null;
  }
}

// === HÀM LÀM SẠCH LINK (ĐỒNG BỘ NGẮN) ===
function cleanUdemyLink(href) {
  try {
    const url = new URL(href);
    if (!url.hostname.includes('udemy.com')) return null;
    const coupon = url.searchParams.get('couponCode');
    if (!coupon) return null;
    return `https://www.udemy.com${url.pathname}?couponCode=${coupon}`;
  } catch {
    return null;
  }
}

// === CHẠY ===
main().catch(err => {
  console.error('Lỗi:', err);
  process.exit(1);
});