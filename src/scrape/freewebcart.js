// freewebcart.js
const { sleep } = require('../utils/time');
const { resolveTrackingUrl } = require('./resolve');
const { handleAdPopup } = require('../utils/ads');

async function extractFreeWebCart(browser, mainPage, baseUrl, checkpoint, MAX_PAGES = 10) {
  await mainPage.goto(baseUrl, { waitUntil: 'networkidle2', timeout: 60000 });
  await sleep(4000);

  // XỬ LÝ POPUP QUẢNG CÁO BẮT BUỘC (CHỈ CHẠY 1 LẦN)
  let adHandled = await handleAdPopup(mainPage);
  if (!adHandled) console.log('⚠ Không thể xử lý popup quảng cáo (trang danh sách)');

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

    for (const link of newLinks) {
      const href = await link.evaluate(el => el.href || el.closest('a')?.href);
      if (!href?.includes('/course/')) continue;

      console.log(`▶ Vào: ${href.split('/course/')[1]?.slice(0, 50)}...`);

      const detailPage = await browser.newPage();
      try {
        await detailPage.goto(href, { waitUntil: 'networkidle2', timeout: 30000 });
        await sleep(2000);
        const detailAdHandled = await handleAdPopup(detailPage);
        if (!detailAdHandled) console.log('⚠ Không thể xử lý popup quảng cáo (trang chi tiết)');

        const enrollBtn = await detailPage.$('a.detail-enroll-btn, a[href*="udemy.com"]');
        if (enrollBtn) {
          const trackingUrl = await enrollBtn.evaluate(el => el.href);
          const finalUrl = await resolveTrackingUrl(browser, trackingUrl);
          if (finalUrl) checkpoint.checkAndAdd(finalUrl);
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

    await loadMore.click();
    await sleep(2000);
    loadCount++;
  }

  console.log(`🛑 FreeWebCart: Hoàn thành – xử lý ${processedCount} khóa học`);
}

module.exports = { extractFreeWebCart };