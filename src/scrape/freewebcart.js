// freewebcart.js
const { sleep } = require('../utils/time');
const { resolveTrackingUrl } = require('../utils/resolve');

// -------- Tunables --------
const NAV_TIMEOUT          = 45000;
const LIST_WAIT_TIMEOUT    = 15000;
const DETAIL_WAIT_TIMEOUT  = 10000;
const MAX_503_RELOADS      = 3;

// Resource types an toàn để bỏ khi chỉ scrape text/link
const BLOCKED_RESOURCE_TYPES = new Set(['image', 'stylesheet', 'font', 'media']);

// Tracker / ads / analytics không bao giờ cần
const BLOCKED_URL_PATTERNS = [
  'google-analytics.com',
  'googletagmanager.com',
  'doubleclick.net',
  'connect.facebook.net',
  'facebook.net',
  'hotjar.com',
  'clarity.ms',
  'adsbygoogle',
  'cdn.onesignal.com',
];

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Gắn dialog/popup handler + request interception vào 1 page bất kỳ.
 * Gọi 1 lần cho mỗi page (kể cả main page lẫn detail page).
 */
async function hardenPage(page) {
  try {
    page.setDefaultTimeout(20000);
    page.setDefaultNavigationTimeout(NAV_TIMEOUT);
  } catch (_) {}

  page.on('dialog', d => d.dismiss().catch(() => {}));
  page.on('popup',  p => p.close().catch(() => {}));

  try {
    await page.setRequestInterception(true);
  } catch (_) {
    return; // có thể đã bật ở nơi khác
  }

  page.on('request', (req) => {
    try {
      if (BLOCKED_RESOURCE_TYPES.has(req.resourceType())) return req.abort();
      const url = req.url();
      if (BLOCKED_URL_PATTERNS.some(s => url.includes(s))) return req.abort();
      return req.continue();
    } catch (_) {
      try { req.continue(); } catch (_) {}
    }
  });
}

async function isNginx503Page(page) {
  try {
    return await page.evaluate(() => {
      const t = (document.title || '').toLowerCase();
      const b = (document.body?.innerText || '').toLowerCase();
      return t.includes('503 service temporarily unavailable')
          || b.includes('503 service temporarily unavailable');
    });
  } catch (_) {
    return false;
  }
}

async function processDetail(detailPage, courseHref, checkpoint) {
  const redirectLink = courseHref.replace('/course/', '/redirect/');
  const shortId = redirectLink.split('/redirect/')[1]?.slice(0, 50) || '';
  console.log(`▶ ${shortId}...`);

  let hit503 = false;

  for (let attempt = 0; attempt <= MAX_503_RELOADS; attempt++) {
    try {
      if (attempt === 0) {
        await detailPage.goto(redirectLink, {
          waitUntil: 'domcontentloaded',
          timeout: NAV_TIMEOUT,
        });
      } else {
        console.log(`♻ 503 nginx, reload ${attempt}/${MAX_503_RELOADS}`);
        await detailPage.reload({
          waitUntil: 'domcontentloaded',
          timeout: NAV_TIMEOUT,
        });
      }
    } catch (e) {
      console.log(`Lỗi goto chi tiết: ${e.message}`);
      return;
    }

    // Nghỉ ngắn để inline JS ổn định (không cần 1.2–3s như cũ)
    await sleep(randomInt(400, 900));

    hit503 = await isNginx503Page(detailPage);
    if (!hit503) break;

    if (attempt < MAX_503_RELOADS) await sleep(randomInt(1200, 2500));
  }

  if (hit503) {
    console.log('⚠ 503 sau reload ➡ bỏ qua');
    return;
  }

  let trackingUrl = null;
  try {
    await detailPage.waitForSelector('a.rd-btn', { timeout: DETAIL_WAIT_TIMEOUT });
    trackingUrl = await detailPage.$eval('a.rd-btn', a => a.href);
  } catch (_) {}

  if (!trackingUrl) {
    console.log('⚠ Không tìm thấy enroll link');
    return;
  }

  const finalUrl = await resolveTrackingUrl(trackingUrl);
  if (finalUrl) checkpoint.checkAndAdd(finalUrl);
}

async function extractFreeWebCart(
  browser,
  mainPage,
  baseUrl,
  checkpoint,
  MAX_PAGES = 10,
  detailConcurrency = 3
) {
  const coursesBaseUrl = 'https://freewebcart.com/courses?page=';

  await hardenPage(mainPage);

  // ---------- Pass 1: gom toàn bộ link course ----------
  const allCourseLinks = [];

  for (let p = 1; p <= MAX_PAGES; p++) {
    const url = coursesBaseUrl + p;
    console.log(`\n📌 Loading page ${p} (FreeWebCart) -> ${url}`);

    try {
      await mainPage.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: NAV_TIMEOUT,
      });
    } catch (e) {
      console.log(`Lỗi load trang ${p}: ${e.message}`);
      break;
    }

    try {
      await mainPage.waitForSelector(
        'div.courses-grid a.course-card-link',
        { timeout: LIST_WAIT_TIMEOUT }
      );
    } catch (e) {
      console.log(`Không tìm thấy courses grid trên trang ${p}`);
      break;
    }

    const hrefs = await mainPage.$$eval(
      'div.courses-grid a.course-card-link',
      els => els.map(a => a.href).filter(h => h && h.includes('/course/'))
    );

    console.log(`➕ Trang ${p}: ${hrefs.length} item`);
    if (hrefs.length === 0) break;

    allCourseLinks.push(...hrefs);
  }

  console.log(`🔗 Tổng ${allCourseLinks.length} khóa học cần lấy link enroll`);
  if (allCourseLinks.length === 0) {
    console.log('🛑 FreeWebCart: Không có khóa học nào');
    return;
  }

  // ---------- Pass 2: worker pool tái sử dụng page ----------
  let cursor = 0;
  const workerCount = Math.max(1, Math.min(detailConcurrency, allCourseLinks.length));

  async function worker(workerId) {
    const page = await browser.newPage();
    await hardenPage(page);

    try {
      while (true) {
        const idx = cursor++;
        if (idx >= allCourseLinks.length) break;
        try {
          await processDetail(page, allCourseLinks[idx], checkpoint);
        } catch (e) {
          console.log(`[w${workerId}] Lỗi: ${e.message}`);
        }
      }
    } finally {
      await page.close().catch(() => {});
    }
  }

  await Promise.all(
    Array.from({ length: workerCount }, (_, i) => worker(i + 1))
  );

  console.log(`🛑 FreeWebCart: Hoàn thành – xử lý ${allCourseLinks.length} khóa học`);
}

module.exports = { extractFreeWebCart };