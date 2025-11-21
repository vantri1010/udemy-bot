const fs = require('fs');
const { FILES } = require('../config/paths');
const { sleep } = require('../utils/time');

async function isFreeCourse(browser, courseUrl, { timeout = 15000 } = {}) {
  const page = await browser.newPage();

  try {
    if (fs.existsSync(FILES.UDEMY_COOKIES)) {
      const cookies = JSON.parse(fs.readFileSync(FILES.UDEMY_COOKIES, 'utf-8'));
      if (Array.isArray(cookies) && cookies.length) {
        await page.setCookie(...cookies);
      }
    }

    await page.goto(courseUrl, { waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {
      console.log('  ⚠ Navigation timeout, continuing...');
    });

    await page.waitForSelector('button[data-purpose="buy-this-course-button"]', { timeout }).catch(() => {
      console.log('  ⚠ Buy button not found');
    });

    await sleep(1000);

    const isFree = await page.evaluate(() => {
      const buttons = document.querySelectorAll('button[data-purpose="buy-this-course-button"]');
      return Array.from(buttons).some((btn) => btn.querySelector('span.ud-btn-label')?.textContent.trim() === 'Enroll now');
    });

    return !!isFree;
  } catch (err) {
    console.log(`  ❌ Error checking course: ${err.message}`);
    return false;
  } finally {
    await page.close().catch(() => {});
  }
}

module.exports = { isFreeCourse };
