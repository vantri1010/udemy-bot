const { sleep } = require('../utils/time');

async function extractDiscUdemy(browser, mainPage, baseUrl, checkpoint, MAX_PAGES = 10, detailConcurrency = 3) {
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

    const detailLinks = await mainPage.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a.card-header'))
      .filter((a) => a.href.includes('https://www.couponami.com/'))
      .map((a) => a.href.replace(/https:\/\/www\.couponami\.com\/(english|English)\//i, 'https://www.couponami.com/go/'))
      return Array.from(new Set(links));
    });

    console.log(`👀 Tìm thấy ${detailLinks.length} trang chi tiết`);
    // console.log(detailLinks);

    if (!detailLinks.length) break;

    // Process detail pages concurrently
    const chunks = [];
    for (let i = 0; i < detailLinks.length; i += detailConcurrency) {
      chunks.push(detailLinks.slice(i, i + detailConcurrency));
    }

    for (const chunk of chunks) {
      await Promise.all(chunk.map(href => processDetailPage(href)));
    }

    async function processDetailPage(href) {
      console.log(`▶ Vào: ${href.split('/go/')[1]?.slice(0, 50)}...`);
      const detailPage = await browser.newPage();
      try {
        // Make the page resilient against blocking dialogs and long ad loads
        try {
          detailPage.setDefaultTimeout(25000);
          detailPage.setDefaultNavigationTimeout(45000);
        } catch (_) {}
        detailPage.on('dialog', d => d.dismiss().catch(() => {}));

        // Enhanced anti-detection measures
        // Set realistic viewport
        await detailPage.setViewport({
          width: Math.floor(Math.random() * (1920 - 1280) + 1280),
          height: Math.floor(Math.random() * (1080 - 720) + 720)
        });
        
        // Set realistic user agent
        await detailPage.setUserAgent(
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        );
        
        // Set realistic headers
        await detailPage.setExtraHTTPHeaders({
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Upgrade-Insecure-Requests': '1'
        });

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
        
        // Random delay to mimic human behavior
        const randomDelay = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
        await sleep(randomDelay(1500, 3000));

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
