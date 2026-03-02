// freewebcart.js
const { sleep } = require('../utils/time');
const { resolveTrackingUrl } = require('../utils/resolve');

async function extractFreeWebCart(browser, mainPage, baseUrl, checkpoint, MAX_PAGES = 10, detailConcurrency = 3) {
  await mainPage.goto(baseUrl, { waitUntil: 'networkidle2', timeout: 60000 });
  await sleep(4000);

  // Set conservative defaults to avoid long hangs on heavy ad pages
  try {
    mainPage.setDefaultTimeout(30000);
    mainPage.setDefaultNavigationTimeout(120000); // 2 minutes
  } catch (_) {}

  // === BÂY GIỜ MỚI BẮT ĐẦU QUÉT ===
  let processedCount = 0;
  let loadCount = 0;
  let noNewItemCount = 0;

  while (loadCount < MAX_PAGES && noNewItemCount < 3) {
    console.log(`\n📌📌📌 Load More ${loadCount + 1} (FreeWebCart) 📌📌📌`);

    try {
      await mainPage.waitForFunction(
        (expected) => document.querySelectorAll('a.course-card-link, .course-card a').length > expected,
        { timeout: 20000 },
        processedCount
      );
      console.log('▶ Đã phát hiện item mới ➡ tiếp tục');
    } catch (e) {
      console.log('🔃 Không thấy item mới sau 20s ➡ thử scroll + đợi thêm...');
      await mainPage.evaluate(() => window.scrollBy(0, 800));
      await sleep(2000);
      const currentCount = await mainPage.evaluate(() => document.querySelectorAll('a.course-card-link, .course-card a').length);
      if (currentCount <= processedCount) {
        noNewItemCount++;
        console.log(`🈵⏳ Không có item mới (lần ${noNewItemCount}/3) ➡ có thể hết`);
        if (noNewItemCount >= 3) {
          console.log('🔌⏳ Đã thử 3 lần không có item mới ➡ dừng hẳn');
          break;
        }
      } else {
        noNewItemCount = 0;
      }
    }

    await sleep(2000);
    const allLinks = await mainPage.$$('a.course-card-link, .course-card a');
    const totalLinks = allLinks.length;

    console.log(`➕ Tổng hiện tại: ${totalLinks} item (đã xử lý ☑: ${processedCount})`);

    if (totalLinks <= processedCount) {
      console.log('⚠ Không có item mới thực sự ➡ chuẩn bị dừng');
      noNewItemCount++;
      if (noNewItemCount >= 3) break;
    } else {
      noNewItemCount = 0;
    }

    const newLinks = allLinks.slice(processedCount);
    console.log(`➡ Xử lý ${newLinks.length} item mới`);

    // Process detail pages concurrently
    const chunks = [];
    for (let i = 0; i < newLinks.length; i += detailConcurrency) {
      chunks.push(newLinks.slice(i, i + detailConcurrency));
    }

    for (const chunk of chunks) {
      await Promise.all(chunk.map(link => processDetailPage(link)));
    }

    async function processDetailPage(link) {
      function randomInt(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
      }

      async function waitForFullReload(page) {
        try {
          await page.waitForFunction(() => document.readyState === 'complete', { timeout: 20000 });
        } catch (_) {}
      }

      async function isNginx503Page(page) {
        try {
          return await page.evaluate(() => {
            const title = (document.title || '').toLowerCase();
            const bodyText = (document.body?.innerText || '').toLowerCase();
            const has503 = title.includes('503 service temporarily unavailable') || bodyText.includes('503 service temporarily unavailable');
            return has503;
          });
        } catch (_) {
          return false;
        }
      }

      // Avoid complex evaluate; get anchor href property directly
      let href = null;
      try {
        const hrefProp = await link.getProperty('href');
        href = hrefProp ? await hrefProp.jsonValue() : null;
      } catch (_) {}
      if (!href?.includes('/course/')) return;

      console.log(`▶ Vào: ${href.split('/course/')[1]?.slice(0, 50)}...`);

      const detailPage = await browser.newPage();
      try {
        // Make the page resilient against blocking dialogs and long ad loads
        try {
          detailPage.setDefaultTimeout(25000);
          detailPage.setDefaultNavigationTimeout(45000);
        } catch (_) {}
        detailPage.on('dialog', d => d.dismiss().catch(() => {}));

        const max503Reloads = 3;
        let hit503 = false;
        for (let attempt = 0; attempt <= max503Reloads; attempt++) {
          if (attempt === 0) {
            await detailPage.goto(href, { waitUntil: 'load', timeout: 45000 });
          } else {
            console.log(`♻ 503 nginx ${href}, reload ${attempt}/${max503Reloads}`);
            await detailPage.reload({ waitUntil: 'load', timeout: 45000 });
          }

          await waitForFullReload(detailPage);
          const postReloadSleepMs = randomInt(1200, 3000);
          await sleep(postReloadSleepMs);

          hit503 = await isNginx503Page(detailPage);
          if (!hit503) break;

          if (attempt < max503Reloads) {
            const betweenReloadSleepMs = randomInt(1500, 4500);
            await sleep(betweenReloadSleepMs);
          }
        }

        if (hit503) {
          console.log('⚠ Trang chi tiết vẫn trả về 503 Service Temporarily Unavailable (nginx) sau khi reload ➡ bỏ qua');
          return;
        }

        // Wait briefly for a likely Udemy link, but don't hang too long
        const selector = 'a.detail-enroll-btn, a[href*="udemy.com"]';
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
              const finalUrl = await resolveTrackingUrl(browser, trackingUrl);
              if (finalUrl) checkpoint.checkAndAdd(finalUrl);
            }
          } catch (e) {
            console.log(`Lỗi lấy liên kết đăng ký: ${e.message}`);
          }
        } else {
          console.log('⚠ Không tìm thấy nút / link Udemy trên trang chi tiết');
        }
      } catch (e) {
        console.log(`Lỗi: ${e.message}`);
      } finally {
        await detailPage.close();
      }
    }

    processedCount = totalLinks;

    const loadMore = await mainPage.$('button.btn-load-more');
    if (!loadMore) {
      console.log('⚠ Không tìm thấy nút Load More ➡ dừng');
      break;
    }

    // Scroll to button and click using evaluate to avoid clickability issues
    try {
      await mainPage.evaluate(btn => {
        btn.scrollIntoView({ behavior: 'smooth', block: 'end' });
        btn.click();
      }, loadMore);
    } catch (e) {
      console.log(`⚠ Không thể click Load More: ${e.message} ➡ dừng`);
      break;
    }

    await sleep(2000);
    loadCount++;
  }

  console.log(`🛑 FreeWebCart: Hoàn thành – xử lý ${processedCount} khóa học`);
}

module.exports = { extractFreeWebCart };