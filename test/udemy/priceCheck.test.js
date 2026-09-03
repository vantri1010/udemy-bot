const { isFreeCourse } = require('../../src/udemy/priceCheck');

function createPage({ status = 200, language = 'English', pricing }) {
  let evaluateCalls = 0;
  const requestHandlers = new Set();

  return {
    setRequestInterception: jest.fn().mockResolvedValue(undefined),
    on: jest.fn((event, handler) => {
      if (event === 'request') requestHandlers.add(handler);
    }),
    off: jest.fn((event, handler) => {
      if (event === 'request') requestHandlers.delete(handler);
    }),
    setExtraHTTPHeaders: jest.fn().mockResolvedValue(undefined),
    goto: jest.fn().mockResolvedValue({ status: () => status }),
    evaluate: jest.fn().mockImplementation(() => {
      evaluateCalls += 1;
      if (evaluateCalls === 1) return Promise.resolve({ available: true, language });
      if (evaluateCalls === 2) return Promise.resolve(undefined); // acceptCookies
      return Promise.resolve(pricing);
    }),
    waitForSelector: jest.fn().mockResolvedValue(undefined),
    close: jest.fn().mockResolvedValue(undefined),
  };
}

function createBrowser(page) {
  return { newPage: jest.fn().mockResolvedValue(page) };
}

describe('isFreeCourse', () => {
  test('identifies a supported-language course with a 100% coupon', async () => {
    const page = createPage({
      pricing: {
        currentPriceText: 'Free',
        originalPriceText: '$49.99',
        discountText: '100% off',
        currentPrice: 0,
        originalPrice: 49.99,
        is100PercentOff: true,
        isCouponFree: true,
      },
    });

    const result = await isFreeCourse(
      createBrowser(page),
      'https://www.udemy.com/course/javascript-101/?couponCode=SAVE',
      10
    );

    expect(result.isFree).toBe(true);
    expect(result.type).toBe('COUPON_FREE');
    expect(page.goto).toHaveBeenCalledWith(
      'https://www.udemy.com/course/javascript-101/?couponCode=SAVE&locale=en_US',
      expect.any(Object)
    );
    expect(page.close).toHaveBeenCalledTimes(1);
    expect(page.off).toHaveBeenCalledTimes(1);
  });

  test('rejects unsupported languages before checking the price', async () => {
    const page = createPage({ language: 'Japanese', pricing: {} });

    const result = await isFreeCourse(
      createBrowser(page),
      'https://www.udemy.com/course/javascript-101/?couponCode=SAVE'
    );

    expect(result).toEqual({
      isFree: false,
      type: 'UNSUPPORTED_LANGUAGE',
      language: 'Japanese',
    });
    expect(page.waitForSelector).not.toHaveBeenCalled();
  });

  test('returns course-not-found for an HTTP 404', async () => {
    const page = createPage({ status: 404 });

    const result = await isFreeCourse(
      createBrowser(page),
      'https://www.udemy.com/course/missing/?couponCode=SAVE'
    );

    expect(result).toEqual({ isFree: false, type: 'COURSE_NOT_FOUND' });
    expect(page.close).toHaveBeenCalledTimes(1);
  });

  test('does not treat a paid or partially discounted course as free', async () => {
    const page = createPage({
      pricing: {
        currentPriceText: '$9.99',
        originalPriceText: '$49.99',
        discountText: '80% off',
        currentPrice: 9.99,
        originalPrice: 49.99,
        is100PercentOff: false,
        isCouponFree: false,
      },
    });

    const result = await isFreeCourse(
      createBrowser(page),
      'https://www.udemy.com/course/javascript-101/?couponCode=SAVE'
    );

    expect(result.isFree).toBe(false);
    expect(result.type).toBe('PAID_OR_NOT_100_OFF');
  });
});