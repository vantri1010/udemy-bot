const { sleep } = require('../utils/time');
const { resolveTrackingUrl } = require('./resolve');
const { cleanUdemyLink } = require('../utils/url');
const { handleAdPopup } = require('../utils/ads');

async function extractOnlineCourses(browser, mainPage, baseUrl, checkpoint, MAX_PAGES = 10, detailConcurrency = 3) {
  let currentPage = 1;
  const MAX_RETRIES = 3;

  // Set conservative defaults to avoid long hangs on heavy ad pages
  try {
    mainPage.setDefaultTimeout(30000);
    mainPage.setDefaultNavigationTimeout(60000);
  } catch (_) {}

  while (currentPage <= MAX_PAGES) {
    const pageUrl = currentPage === 1 ? baseUrl : `${baseUrl.replace(/\/$/, '')}/page/${currentPage}/`;
    console.log(`\n📌📌📌 Trang ${currentPage}: ${pageUrl} 📌📌📌`);

    let pageLoaded = false;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        await mainPage.goto(pageUrl, { waitUntil: 'networkidle2', timeout: 60000 });
        pageLoaded = true;
        break;
      } catch (e) {
        const backoff = Math.pow(2, attempt - 1) * 2000;
        console.log(`🔄🔙 Attempt ${attempt} failed: ${e.message}. Retrying in ${backoff}ms...`);
        await sleep(backoff);
      }
    }

    if (!pageLoaded) {
      console.log(`⚠↪ Không thể load trang ${currentPage} sau ${MAX_RETRIES} lần thử`);
      break;
    }

    await sleep(2000);
    
    const detailLinks = await mainPage.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a.re_track_btn'))
        .map((a) => a.href)
        .filter((h) => h.includes('https://www.onlinecourses.ooo/coupon/'));
      return Array.from(new Set(links));
    });
    
    console.log(`👀 Tìm thấy ${detailLinks.length} trang chi tiết`);
    if (!detailLinks.length) break;
    
    const mainAdHandled = await handleAdPopup(mainPage);
    if (!mainAdHandled) console.log('⚠ Không thể xử lý popup quảng cáo (trang danh sách)');

    // Process detail pages concurrently
    const chunks = [];
    for (let i = 0; i < detailLinks.length; i += detailConcurrency) {
      chunks.push(detailLinks.slice(i, i + detailConcurrency));
    }

    for (const chunk of chunks) {
      await Promise.all(chunk.map(href => processDetailPage(href)));
    }

    async function processDetailPage(href) {
      console.log(`▶ Vào: ${href.split('/coupon/')[1]?.slice(0, 50)}...`);
      const detailPage = await browser.newPage();
      try {
        // Make the page resilient against blocking dialogs and long ad loads
        try {
          detailPage.setDefaultTimeout(25000);
          detailPage.setDefaultNavigationTimeout(45000);
        } catch (_) {}
        detailPage.on('dialog', d => d.dismiss().catch(() => {}));

        pageLoaded = false;
        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
          try {
            await detailPage.goto(href, { waitUntil: 'domcontentloaded', timeout: 45000 });
            pageLoaded = true;
            break;
          } catch (e) {
            const backoff = Math.pow(2, attempt - 1) * 2000;
            console.log(`🔁⏸ Attempt ${attempt} failed: ${e.message}. Retrying in ${backoff}ms...`);
            await sleep(backoff);
          }
        }
        if (!pageLoaded) {
          console.log(`⚠ Không thể load trang ${currentPage} sau ${MAX_RETRIES} lần thử`);
          return;
        }
        await sleep(2000);

        // Wait briefly for the enroll button
        const selector = 'a.re_track_btn';
        let enrollBtn = null;
        try {
          await detailPage.waitForSelector(selector, { timeout: 15000 });
          enrollBtn = await detailPage.$(selector);
        } catch (_) {}

        if (enrollBtn) {
          try {
            const hrefProp = await enrollBtn.getProperty('href');
            const trackingUrl = hrefProp ? await hrefProp.jsonValue() : null;
            if (trackingUrl) {
              const finalUrl = cleanUdemyLink(await resolveTrackingUrl(browser, trackingUrl));
              checkpoint.checkAndAdd(finalUrl);
            }
          } catch (e) {
            console.log(`Lỗi lấy liên kết đăng ký: ${e.message}`);
          }
        } else {
          console.log('⚠ Không tìm thấy nút đăng ký');
        }
      } catch (e) {
        console.log(`❌ Lỗi: ${e.message}`);
      } finally {
        await detailPage.close();
      }
    }

    currentPage++;
  }
}

module.exports = { extractOnlineCourses };
