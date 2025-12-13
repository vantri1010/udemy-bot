const { sleep } = require('../utils/time');
const { resolveTrackingUrl } = require('./resolve');
const { cleanUdemyLink } = require('../utils/url');
const { handleAdPopup } = require('../utils/ads');

async function extractDiscUdemy(browser, mainPage, baseUrl, checkpoint, MAX_PAGES = 10) {
  let currentPage = 1;
  const MAX_RETRIES = 3;

  while (currentPage <= MAX_PAGES) {
    const pageUrl = currentPage === 1 ? baseUrl : `${baseUrl.replace(/\/$/, '')}/${currentPage}/`;
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

    await sleep(1000);
    const mainAdHandled = await handleAdPopup(mainPage);
    if (!mainAdHandled) console.log('⚠ Không thể xử lý popup quảng cáo (trang danh sách)');

    const detailLinks = await mainPage.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a.card-header'))
      .filter((a) => a.href.includes('https://www.discudemy.com/'))
      .map((a) => a.href.replace(/https:\/\/www\.discudemy\.com\/(english|English)\//i, 'https://www.discudemy.com/go/'))
      return Array.from(new Set(links));
    });

    console.log(`👀 Tìm thấy ${detailLinks.length} trang chi tiết`);
    // console.log(detailLinks);

    if (!detailLinks.length) break;

    for (const href of detailLinks) {
      console.log(`▶ Vào: ${href.split('/go/')[1]?.slice(0, 50)}...`);
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
        await sleep(1000);
        const detailAdHandled = await handleAdPopup(detailPage);
        if (!detailAdHandled) console.log('⚠ Không thể xử lý popup quảng cáo (trang chi tiết)');

        const trackingUrl = await detailPage.evaluate(() => {
          const segment = document.querySelector('div.ui.segment');
          if (segment) {
            const link = segment.querySelector('a[href*="udemy.com"][href*="couponCode="]');
            return link ? link.href : null;
          }
          return null;
        });

        if (trackingUrl) {
          checkpoint.checkAndAdd(trackingUrl);
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

module.exports = { extractDiscUdemy };
