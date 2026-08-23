const { sleep } = require('../utils/time');
const { addCourseToCart, acceptCookies } = require('./addToCart');

async function hasFreeIndividualPurchase(page) {
  return page.evaluate(() => {
    const isFreePrice = (text) => /^(free|miễn phí)$/i.test(text.replace(/\s+/g, ' ').trim());
    const enrollmentBox = document.querySelector('[data-purpose="enrollment-box"]');

    if (enrollmentBox) return false;

    const buyBox = document.querySelector('[data-purpose="buy-box"]');
    if (buyBox) {
      const price = buyBox.querySelector('[data-purpose="course-price-text"]');
      if (price && isFreePrice(price.textContent)) return true;
    }

    const individualPanelButton = [...document.querySelectorAll('button[aria-controls]')]
      .find((button) => /mua khóa học riêng lẻ|buy this course|individual/i.test(button.textContent));
    if (!individualPanelButton || individualPanelButton.getAttribute('aria-expanded') !== 'true') return false;

    const panel = document.getElementById(individualPanelButton.getAttribute('aria-controls'));
    const price = panel?.querySelector('[data-purpose="course-price-text"]');
    return !!price && isFreePrice(price.textContent);
  });
}

async function isFreeCourse(browser, courseUrl, verifyTimeout = 15000, options = {}) {
  const { addToCart = false } = options;
  const page = await browser.newPage();

  try {
    await page.goto(courseUrl, { waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {
      console.log('  ⚠ Navigation timeout, continuing...');
    });

    // Dismiss cookie banners that can block clicks
    await acceptCookies(page);

    await page.waitForSelector('[data-purpose="buy-box"], [data-purpose="enrollment-box"], button[data-purpose="buy-this-course-button"]', { timeout: 30000 }).catch(() => {
      console.log('  ⚠ Buy button not found');
    });

    await sleep(1000);

    await page.evaluate(() => {
      const button = [...document.querySelectorAll('button[aria-controls]')]
        .find((item) => /mua khóa học riêng lẻ|buy this course|individual/i.test(item.textContent));
      if (button && button.getAttribute('aria-expanded') !== 'true') button.click();
    });
    await sleep(300);

    const isFree = await hasFreeIndividualPurchase(page);

    if (isFree && addToCart) {
      const result = await addCourseToCart(page, verifyTimeout);

      if (result.added && result.verified) {
        console.log('  🛒 Added to cart');
      } else if (result.added && !result.verified) {
        console.log('  ⚠ Added but verification timed out');
      } else {
        console.log(`  ⚠ Add-to-cart failed: ${result.reason || 'unknown'}`);
      }
    } else if (isFree) {
      console.log('  ℹ Free course detected - add-to-cart skipped (flag not set)');
    }

    return !!isFree;
  } catch (err) {
    console.log(`  ❌ Error checking course: ${err.message}`);
    return false;
  } finally {
    await page.close().catch(() => {});
  }
}

module.exports = { isFreeCourse, hasFreeIndividualPurchase };
