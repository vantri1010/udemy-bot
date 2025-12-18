import { sleep } from '../utils/time';
import { addCourseToCart, acceptCookies } from './addToCart';

async function getCartCount(page) {
  try {
    const selectors = [
      'div[data-testid="header-cart"] span[title]',
      'button#shopping-cart-trigger span[title]',
      'div[data-testid="header-cart"] .ud-notification-badge',
      'a[href="/cart/"] span[data-purpose="item-count-badge"]',
      'span[data-purpose="item-count-badge"]',
    ];

    // Look for the badge in both the new header markup and the legacy cart link.
    const count = await page
      .evaluate((list) => {
        for (const selector of list) {
          const node = document.querySelector(selector);
          if (!node) continue;
          const value = parseInt(node.textContent.trim(), 10);
          if (Number.isFinite(value)) return value;
        }
        return 0;
      }, selectors)
      .catch(() => 0);

    return Number.isFinite(count) ? count : 0;
  } catch (err) {
    console.log(`⚠ Cannot read cart count: ${err.message}`);
    return 0;
  } 
}
module.exports = { getCartCount };