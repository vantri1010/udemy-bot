// freewebcart.js
const { sleep } = require('../utils/time');
const { resolveTrackingUrl } = require('../utils/resolve');

async function extractFreeWebCart(browser, mainPage, baseUrl, checkpoint, MAX_PAGES = 10, detailConcurrency = 3) {
  // Change baseUrl to courses page with pagination
  const coursesBaseUrl = 'https://freewebcart.com/courses?page=';
  let page = 1;

  // Set conservative defaults to avoid long hangs on heavy ad pages
  try {
    mainPage.setDefaultTimeout(30000);
    mainPage.setDefaultNavigationTimeout(120000); // 2 minutes
  } catch (_) {}

  // === BÂY GIỜ MỚI BẮT ĐẦU QUÉT ===
  let processedCount = 0;

  while (page <= MAX_PAGES) {
    const currentUrl = coursesBaseUrl + page;
    console.log(`\n📌📌📌 Loading page ${page} (FreeWebCart) 📌📌📌`);

    try {
      await mainPage.goto(currentUrl, { waitUntil: 'networkidle2', timeout: 60000 });
      await sleep(4000);
    } catch (e) {
      console.log(`Lỗi load trang ${page}: ${e.message}`);
      break;
    }

    // Wait for courses grid to load
    try {
      await mainPage.waitForSelector('div.courses-grid a.course-card-link', { timeout: 30000 });
    } catch (e) {
      console.log(`Không tìm thấy courses grid trên trang ${page}: ${e.message}`);
      break;
    }

    const allLinks = await mainPage.$$('div.courses-grid a.course-card-link');
    const totalLinks = allLinks.length;

    console.log(`➕ Trang ${page}: ${totalLinks} item`);

    if (totalLinks === 0) {
      console.log('⚠ Không có item trên trang này ➡ dừng');
      break;
    }

    // Process all links on this page concurrently in chunks
    const chunks = [];
    for (let i = 0; i < allLinks.length; i += detailConcurrency) {
      chunks.push(allLinks.slice(i, i + detailConcurrency));
    }

    for (const chunk of chunks) {
      await Promise.all(chunk.map(link => processDetailPage(link)));
    }

    processedCount += totalLinks;
    page++;

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
            const has503 = title.includes('503 Service Temporarily Unavailable') || bodyText.includes('503 Service Temporarily Unavailable') || bodyText.includes('nginx');
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
          detailPage.setDefaultTimeout(30000);
          detailPage.setDefaultNavigationTimeout(60000);
        } catch (_) {}
        detailPage.on('dialog', d => d.dismiss().catch(() => {}));

        const max503Reloads = 3;
        let hit503 = false;
        for (let attempt = 0; attempt <= max503Reloads; attempt++) {
          if (attempt === 0) {
            await detailPage.goto(href, { waitUntil: 'load', timeout: 60000 });
          } else {
            console.log(`♻ 503 nginx ${href}, reload ${attempt}/${max503Reloads}`);
            await detailPage.reload({ waitUntil: 'load', timeout: 60000 });
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

        // Find and click the enroll button with retry on 503
        const enrollBtnSelector = 'button.detail-enroll-btn';
        let enrollBtn = null;
        try {
          await detailPage.waitForSelector(enrollBtnSelector, { timeout: 20000 });
          enrollBtn = await detailPage.$(enrollBtnSelector);
        } catch (_) {}

        if (enrollBtn) {
          const maxEnrollRetries = 3;
          let enrollSuccess = false;

          for (let enrollAttempt = 0; enrollAttempt <= maxEnrollRetries; enrollAttempt++) {
            try {
              if (enrollAttempt > 0) {
                console.log(`♻ Retry enroll click ${enrollAttempt}/${maxEnrollRetries}`);
                await detailPage.reload({ waitUntil: 'load', timeout: 60000 });
                await waitForFullReload(detailPage);
                await sleep(randomInt(1200, 3000));
                enrollBtn = await detailPage.$(enrollBtnSelector);
                if (!enrollBtn) continue;
              }

              await enrollBtn.click();
              await sleep(3000); // Wait for the page to load after click

              // Check for 503 after click
              hit503 = await isNginx503Page(detailPage);
              if (!hit503) {
                enrollSuccess = true;
                break;
              } else {
                console.log(`⚠ 503 sau khi bấm enroll button, attempt ${enrollAttempt + 1}`);
                if (enrollAttempt < maxEnrollRetries) {
                  await sleep(randomInt(1500, 4500));
                }
              }
            } catch (e) {
              console.log(`Lỗi khi bấm enroll button attempt ${enrollAttempt + 1}: ${e.message}`);
              if (enrollAttempt < maxEnrollRetries) {
                await sleep(randomInt(1500, 4500));
              }
            }
          }

          if (!enrollSuccess) {
            console.log('⚠ Không thể bấm enroll button thành công sau retry ➡ bỏ qua');
            return;
          }

          // Now find the "Go to Course Now" link
          const goToCourseSelector = 'a.rd-btn';
          let goToCourseLink = null;
          try {
            await detailPage.waitForSelector(goToCourseSelector, { timeout: 20000 });
            goToCourseLink = await detailPage.$(goToCourseSelector);
          } catch (_) {}

          if (goToCourseLink) {
            const hrefProp = await goToCourseLink.getProperty('href');
            const trackingUrl = hrefProp ? await hrefProp.jsonValue() : null;
            if (trackingUrl) {
              const finalUrl = await resolveTrackingUrl(browser, trackingUrl);
              if (finalUrl) checkpoint.checkAndAdd(finalUrl);
            }
          } else {
            console.log('⚠ Không tìm thấy nút "Go to Course Now" sau khi bấm enroll');
          }
        } else {
          console.log('⚠ Không tìm thấy nút enroll trên trang chi tiết');
        }
      } catch (e) {
        console.log(`Lỗi: ${e.message}`);
      } finally {
        await detailPage.close();
      }
    }
  }

  console.log(`🛑 FreeWebCart: Hoàn thành – xử lý ${processedCount} khóa học`);
}

module.exports = { extractFreeWebCart };