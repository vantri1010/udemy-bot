const { sleep } = require('../utils/time');
const { extractUdemyFromTrk } = require('../utils/url');

async function extractInventHigh(mainPage, baseUrl, checkpoint, MAX_PAGES = 5) {
  const MAX_RETRIES = 3;
  let pageLoaded = false;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      await mainPage.goto(baseUrl, { waitUntil: 'networkidle2', timeout: 60000 });
      pageLoaded = true;
      break;
    } catch (e) {
      const backoff = Math.pow(2, attempt - 1) * 2000;
      console.log(`🔄🔙 Attempt ${attempt} failed: ${e.message}. Retrying in ${backoff}ms...`);
      await sleep(backoff);
    }
  }

  if (!pageLoaded) {
    console.log(`⚠↪ Không thể load trang chính sau ${MAX_RETRIES} lần thử`);
    return;
  }

  await sleep(4000);

  const latestBtn = await mainPage.$('a[data-filter="latest"]');
  if (latestBtn) await latestBtn.click();
  await sleep(3000);

  let pageNum = 1;
  while (pageNum <= MAX_PAGES) {
    console.log(`\n📌📌📌 Trang ${pageNum} (InventHigh) 📌📌📌`);

    const hrefs = await mainPage.evaluate(() =>
      Array.from(document.querySelectorAll('a.btn.btnmain'))
        .map((a) => a.href)
        .filter((h) => h.includes('trk.udemy.com'))
    );

    for (const href of hrefs) {
      const finalUrl = extractUdemyFromTrk(href);
      checkpoint.checkAndAdd(finalUrl);
    }

    const nextBtn = await mainPage.$(`a.pagination-link[data-page="${pageNum + 1}"]`);
    if (!nextBtn) break;
    await nextBtn.click();
    await sleep(3000);
    pageNum++;
  }
}

module.exports = { extractInventHigh };
