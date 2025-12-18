const fs = require('fs');
const { sleep } = require('../utils/time');
const { addCourseToCart, acceptCookies } = require('./addToCart');

async function isFreeCourse(browser, courseUrl, verifyTimeout = 15000) {
  const page = await browser.newPage();

  try {
    await page.goto(courseUrl, { waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {
      console.log('  ⚠ Navigation timeout, continuing...');
    });

    // Dismiss cookie banners that can block clicks
    await acceptCookies(page);

    await page.waitForSelector('button[data-purpose="buy-this-course-button"]', { timeout: 30000 }).catch(() => {
      console.log('  ⚠ Buy button not found');
    });

    await sleep(1000);

    const isFree = await page.evaluate(() => {
      const buttons = document.querySelectorAll('button[data-purpose="buy-this-course-button"]');
      return Array.from(buttons).some((btn) => btn.querySelector('span.ud-btn-label')?.textContent.trim() === 'Enroll now');
    });

    if (isFree) {
      try {
        const result = await addCourseToCart(page, verifyTimeout);
  
        if (result.added && result.verified) {
          console.log('  🛒 Added to cart');
        } else if (result.added && !result.verified) {
          console.log('  ⚠ Added but verification timed out');
        } else {
          console.log(`  ⚠ Add-to-cart failed: ${result.reason || 'unknown'}`);
        }
      } finally {
        await page.close().catch(() => {});
      }
    }

    return !!isFree;
  } catch (err) {
    console.log(`  ❌ Error checking course: ${err.message}`);
    return false;
  } finally {
    await page.close().catch(() => {});
  }
}

module.exports = { isFreeCourse };
