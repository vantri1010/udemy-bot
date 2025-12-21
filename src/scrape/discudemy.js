const { sleep } = require('../utils/time');
const { handleAdPopup } = require('../utils/ads');

async function extractDiscUdemy(browser, mainPage, baseUrl, checkpoint, MAX_PAGES = 10) {
  let currentPage = 1;
  const MAX_RETRIES = 3;

  // Set conservative defaults to avoid long hangs on heavy ad pages
  try {
    mainPage.setDefaultTimeout(30000);
    mainPage.setDefaultNavigationTimeout(60000);
  } catch (_) {}

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
          break;
        }
        await sleep(1000);
        const detailAdHandled = await handleAdPopup(detailPage);
        if (!detailAdHandled) console.log('⚠ Không thể xử lý popup quảng cáo (trang chi tiết)');

        // Wait briefly for the Udemy coupon link
        const selector = 'div.ui.segment a[href*="udemy.com"][href*="couponCode="]';
        let couponLink = null;
        try {
          await detailPage.waitForSelector(selector, { timeout: 15000 });
          couponLink = await detailPage.$(selector);
        } catch (_) {}

        if (couponLink) {
          try {
            const hrefProp = await couponLink.getProperty('href');
            const trackingUrl = hrefProp ? await hrefProp.jsonValue() : null;
            if (trackingUrl) {
              checkpoint.checkAndAdd(trackingUrl);
            }
          } catch (e) {
            console.log(`Lỗi lấy liên kết coupon: ${e.message}`);
          }
        } else {
          console.log('⚠ Không tìm thấy link Udemy coupon');
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
