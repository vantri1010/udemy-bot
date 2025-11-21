const { readJson, writeJson } = require('../utils/fsUtils');
const { FILES } = require('../config/paths');
const { sleep } = require('../utils/time');

async function fetchPurchasedCourses(browser, { MAX_RETRIES = 5, BASE_DELAY = 500, PAGE_SIZE = 100 } = {}) {
  const page = await browser.newPage();
  console.log('👀 Fetching purchased courses from Udemy API...');

  let startPage = 1;
  let purchasedCourses = [];

  const progress = readJson(FILES.UDEMY_PURCHASED, null, ['udemy_purchased.json']);
  if (progress) {
    startPage = (progress.lastFetchedPage || 0) + 1;
    purchasedCourses = progress.purchdLinks || [];
    console.log(`⏯ Resuming from page ${startPage}`);
  }

  await page.goto('https://www.udemy.com/', { waitUntil: 'networkidle2', timeout: 60000 });

  async function fetchPageWithRetry(url) {
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const result = await page.evaluate(async (url) => {
          try {
            const resp = await fetch(url, { method: 'GET', headers: { Accept: 'application/json, text/plain, */*', 'Content-Type': 'application/json;charset=UTF-8' }, credentials: 'include' });
            const status = resp.status;
            let body = null;
            try { body = await resp.json(); } catch (_) { body = null; }
            return { ok: resp.ok, status, body };
          } catch (err) { return { networkError: String(err) }; }
        }, url);

        if (result?.networkError) throw new Error(result.networkError);
        if (result?.status === 401 || result?.status === 403) throw new Error(`Unauthorized (status ${result.status})`);
        if (result?.body && !result.body.results) return result.body;
        if (result?.ok && result?.body) return result.body;
        throw new Error(`Unexpected response (status=${result?.status})`);
      } catch (err) {
        if (attempt === MAX_RETRIES) throw err;
        const backoff = BASE_DELAY * Math.pow(2, attempt - 1);
        const jitter = Math.floor(Math.random() * 200);
        console.log(`⚠ Attempt ${attempt} failed: ${err.message}. Retrying in ${backoff + jitter}ms`);
        await sleep(backoff + jitter);
      }
    }
    throw new Error(`Failed to fetch after ${MAX_RETRIES} attempts`);
  }

  let pageNum = startPage;
  while (true) {
    console.log(`➡ Fetching page ${pageNum}...`);
    const url = `https://www.udemy.com/api-2.0/users/me/subscribed-courses/?page=${pageNum}&page_size=${PAGE_SIZE}`;

    let json;
    try { json = await fetchPageWithRetry(url); }
    catch (err) {
      writeJson(FILES.UDEMY_PURCHASED, { lastFetchedPage: pageNum - 1, purchdLinks: purchasedCourses });
      console.log(`⚠ Error fetching page ${pageNum}: ${err.message}. Progress saved.`);
      throw err;
    }

    if (!json?.results) { console.log('⚠ No results. Cookie may be expired or not logged in.'); break; }

    const cleanedPage = json.results.map((c) => ({
      id: c.id,
      title: c.title,
      url: 'https://www.udemy.com' + c.url.replace(/\/$/, '').replace(/\/learn$/, ''),
      instructors: c.visible_instructors.map((i) => i.title),
    }));

    purchasedCourses.push(...cleanedPage);
    writeJson(FILES.UDEMY_PURCHASED, { lastFetchedPage: pageNum, purchdLinks: purchasedCourses });
    console.log(`✅ Fetched page ${pageNum} (${cleanedPage.length} items)`);

    if (json.results.length < PAGE_SIZE) break;
    pageNum++;
    await sleep(400);
  }

  await page.close();
  console.log(`📚 Total purchased courses: ${purchasedCourses.length}`);
  return purchasedCourses;
}

module.exports = { fetchPurchasedCourses };
