const { sleep } = require('../utils/time');
const { resolveTrackingUrl } = require('./resolve');
const { cleanUdemyLink } = require('../utils/url');
const { handleAdPopup } = require('../utils/ads');

async function extractOnlineCourses(browser, mainPage, baseUrl, checkpoint, MAX_PAGES = 10) {
  let currentPage = 1;
  const MAX_RETRIES = 3;

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
    const mainAdHandled = await handleAdPopup(mainPage);
    if (!mainAdHandled) console.log('⚠ Không thể xử lý popup quảng cáo (trang danh sách)');

    const detailLinks = await mainPage.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a.re_track_btn'))
        .map((a) => a.href)
        .filter((h) => h.includes('https://www.onlinecourses.ooo/coupon/'));
      return Array.from(new Set(links));
    });

    console.log(`👀 Tìm thấy ${detailLinks.length} trang chi tiết`);
    if (!detailLinks.length) break;

    for (const href of detailLinks) {
      console.log(`▶ Vào: ${href.split('/coupon/')[1]?.slice(0, 50)}...`);
      const detailPage = await browser.newPage();
      try {
        pageLoaded = false;
        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
          try {
            await detailPage.goto(href, { waitUntil: 'networkidle2', timeout: 60000 });
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
          break;
        }
        await sleep(2000);
        const detailAdHandled = await handleAdPopup(detailPage);
        if (!detailAdHandled) console.log('⚠ Không thể xử lý popup quảng cáo (trang chi tiết)');

        const enrollBtn = await detailPage.$('a.re_track_btn');
        if (enrollBtn) {
          const trackingUrl = await enrollBtn.evaluate((el) => el.href);
          const finalUrl = cleanUdemyLink(await resolveTrackingUrl(browser, trackingUrl));
          checkpoint.checkAndAdd(finalUrl);
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
