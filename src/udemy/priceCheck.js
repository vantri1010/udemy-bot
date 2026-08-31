const { addCourseToCart, acceptCookies } = require('./addToCart');

const SUPPORTED_COURSE_LANGUAGES = new Set(['english', 'vietnamese']);

function normalizeLanguageValue(language) {
  return String(language || '').trim().toLowerCase();
}

function getCourseLanguageValue(source) {
  if (!source) return null;

  if (typeof source === 'string') {
    const text = source.trim();
    if (!text) return null;

    if (/<\s*\w+[^>]*>/i.test(text)) {
      const match = text.match(/<span[^>]*>\s*(English|Vietnamese)\s*<\/span>/i)
        || text.match(/(English|Vietnamese)/i);
      return match ? match[1] || match[0] : null;
    }

    return text;
  }

  if (source && typeof source.querySelector === 'function') {
    const languageNode = source.querySelector('[data-purpose="course-language"] span');
    return languageNode?.textContent?.trim() || null;
  }

  return null;
}

function isSupportedCourseLanguage(source) {
  const language = getCourseLanguageValue(source);
  return SUPPORTED_COURSE_LANGUAGES.has(normalizeLanguageValue(language));
}

async function isFreeCourse(
  browser,
  courseUrl,
  verifyTimeout = 15000,
  options = {}
) {
  const { addToCart = false } = options;

  const page = await browser.newPage();

  try {
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9'
    });

    const englishCourseUrl = new URL(courseUrl);
    englishCourseUrl.searchParams.set('locale', 'en_US');

    const response = await page.goto(englishCourseUrl.toString(), {
      waitUntil: 'networkidle2',
      timeout: 30000
    }).catch(() => {
      console.log('  ⚠ Navigation timeout, continuing...');
    });

    const courseAvailable = response?.status() !== 404
      && await page.evaluate(() => {
        const pageText = document.body?.textContent || '';
        return !/course\s+(not found|is unavailable)|page\s+not\s+found/i.test(pageText);
      });

    if (!courseAvailable) {
      return {
        isFree: false,
        type: 'COURSE_NOT_FOUND'
      };
    }

    await acceptCookies(page);

    const languageResult = await page.evaluate(() => {
      const node = document.querySelector('[data-purpose="course-language"] span');
      return node?.textContent?.trim() || null;
    });

    if (!isSupportedCourseLanguage(languageResult)) {
      console.log(`  ⏭ Unsupported course language: ${languageResult || 'unknown'} - skipping`);
      return {
        isFree: false,
        type: 'UNSUPPORTED_LANGUAGE',
        language: languageResult || null
      };
    }

    // Wait until Udemy renders the individual-course pricing box.
    await page.waitForSelector(
      '[data-purpose="course-price-text"]',
      {
        timeout: verifyTimeout
      }
    ).catch(() => {
      console.log('  ⚠ Course price element not found');
    });

    const result = await page.evaluate(() => {
      const priceElement = document.querySelector(
        '[data-purpose="course-price-text"]'
      );

      const originalPriceElement = document.querySelector(
        '[data-purpose="course-original-price-text"]'
      );

      const discountElement = document.querySelector(
        '[data-purpose="discount-percentage"]'
      );

      const currentPriceText =
        priceElement?.textContent?.trim() || '';

      const originalPriceText =
        originalPriceElement?.textContent?.trim() || '';

      const discountText =
        discountElement?.textContent?.trim() || '';

      const is100PercentOff =
        /100\s*%\s*off/i.test(discountText);

      const parsePrice = (text) => {
        if (/free|miễn\s*phí/i.test(text)) return 0;

        const numericText = text
          .replace(/\u00a0/g, ' ')
          .match(/-?\d[\d.,]*/)?.[0];

        if (!numericText) return null;

        const lastComma = numericText.lastIndexOf(',');
        const lastDot = numericText.lastIndexOf('.');
        let normalizedText = numericText;

        const separator = lastComma > lastDot ? ',' : '.';
        const hasThousandsGroups =
          /^[\d]+([,.][\d]{3})+$/.test(numericText);

        if (hasThousandsGroups) {
          normalizedText = numericText.replace(/[,.]/g, '');
        } else if (lastComma > lastDot) {
          normalizedText = numericText
            .replace(/\./g, '')
            .replace(',', '.');
        } else {
          normalizedText = numericText.replace(/,/g, '');
        }

        const price = Number(normalizedText);
        return Number.isFinite(price) ? price : null;
      };

      const currentPrice = parsePrice(currentPriceText);
      const originalPrice = parsePrice(originalPriceText);

      return {
        currentPriceText,
        originalPriceText,
        discountText,
        currentPrice,
        originalPrice,
        is100PercentOff,
        isCouponFree: is100PercentOff
          && currentPrice === 0
          && originalPrice > 0
      };
    });

    /*
     * We only care about:
     *
     *   Paid course
     *   + coupon applied
     *   + 100% off
     */

    const isFree = result.isCouponFree;

    if (isFree && addToCart) {
      const cartResult = await addCourseToCart(
        page,
        verifyTimeout
      );

      if (cartResult.added && cartResult.verified) {
        console.log('  🛒 Added to cart');
      } else if (
        cartResult.added &&
        !cartResult.verified
      ) {
        console.log(
          '  ⚠ Added but verification timed out'
        );
      } else {
        console.log(
          `  ⚠ Add-to-cart failed: ${cartResult.reason || 'unknown'
          }`
        );
      }
    } else if (isFree) {
      console.log(
        '  🎟 100% coupon detected - course is free'
      );
    }

    return {
      isFree,
      type: isFree
        ? 'COUPON_FREE'
        : 'PAID_OR_NOT_100_OFF',
      evidence: result
    };

  } catch (err) {
    console.log(
      `  ❌ Error checking course: ${err.message}`
    );

    return {
      isFree: false,
      type: 'ERROR',
      error: err.message
    };

  } finally {
    await page.close().catch(() => { });
  }
}

module.exports = {
  isFreeCourse,
  getCourseLanguageValue,
  isSupportedCourseLanguage,
  SUPPORTED_COURSE_LANGUAGES
};