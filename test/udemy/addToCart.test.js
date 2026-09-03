jest.mock('../../src/utils/time', () => ({
  sleep: jest.fn().mockResolvedValue(undefined),
}));

const { addCourseToCart } = require('../../src/udemy/addToCart');

function createPage({ selectorFound = true, label = 'Add to Cart', verified = true } = {}) {
  return {
    $: jest.fn().mockImplementation((selector) => Promise.resolve(
      selectorFound && selector.includes('add-to-cart-button') ? {} : null
    )),
    $eval: jest.fn().mockResolvedValue(label),
    waitForFunction: jest.fn().mockImplementation(() => (
      verified ? Promise.resolve() : Promise.reject(new Error('timeout'))
    )),
    evaluate: jest.fn().mockResolvedValue(undefined),
    reload: jest.fn().mockResolvedValue(undefined),
  };
}

describe('addCourseToCart', () => {
  test('clicks a valid button and verifies the cart state', async () => {
    const page = createPage();

    const result = await addCourseToCart(page, 10);

    expect(result).toEqual({ added: true, verified: true, reason: null });
    expect(page.$).toHaveBeenCalled();
    expect(page.$eval).toHaveBeenCalledTimes(1);
    expect(page.waitForFunction).toHaveBeenCalledTimes(2);
    expect(page.evaluate).toHaveBeenCalledTimes(2);
  });

  test('reports a missing add-to-cart button', async () => {
    const page = createPage({ selectorFound: false });

    await expect(addCourseToCart(page, 10)).resolves.toEqual({
      added: false,
      verified: false,
      reason: 'add-to-cart not found',
    });
    expect(page.$eval).not.toHaveBeenCalled();
    expect(page.waitForFunction).not.toHaveBeenCalled();
  });

  test('does not click a button with an unexpected label', async () => {
    const page = createPage({ label: 'Buy now' });

    await expect(addCourseToCart(page, 10)).resolves.toEqual({
      added: false,
      verified: false,
      reason: 'unexpected label: Buy now',
    });
    expect(page.waitForFunction).not.toHaveBeenCalled();
  });
});