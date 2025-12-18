const { sleep } = require("../utils/time");

async function acceptCookies(page) {
  try {
    await page.evaluate(() => {
      document.querySelector("#onetrust-accept-btn-handler")?.click();
      document.querySelector('button[data-purpose="accept-cookies"]')?.click();
    });
  } catch {}
}

async function safeClick(
  page,
  selector,
  { retries = 3, baseTimeout = 5000 } = {}
) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const currentTimeout = baseTimeout * attempt;
      console.log(`  ℹ Attempt ${attempt} with timeout ${currentTimeout}ms`);

      await page.evaluate((sel) => {
        const el = document.querySelector(sel);
        if (!el) throw new Error("Element not found");
        el.scrollIntoView({ block: "center", inline: "center" });
      }, selector);

      await sleep(300);

      // Use DOM click directly
      await page.evaluate((sel) => {
        const el = document.querySelector(sel);
        if (!el) throw new Error("Element not found for click");
        el.click();
      }, selector);

      console.log(`  ✓ DOM click succeeded (attempt ${attempt})`);
      return true;
    } catch (err) {
      console.log(`  ⚠ Attempt ${attempt} failed: ${err.message}`);
      if (attempt < retries) {
        console.log("  ↻ Reloading page...");
        await page
          .reload({ waitUntil: "networkidle2", timeout: 30000 })
          .catch(() => {});
        await acceptCookies(page);
        await sleep(1000);
      } else {
        return false;
      }
    }
  }
  return false;
}

async function addCourseToCart(page, verifyTimeout = 30000) {
  const selectors = [
    'div[data-purpose="add-to-cart"] button[data-testid="add-to-cart-button"]',
    'button[data-testid="add-to-cart-button"]',
    "button.add-to-cart",
    'div[data-purpose="add-to-cart"] button',
  ];
  let addSelector = null;

  for (const sel of selectors) {
    const exists = await page.$(sel).catch(() => null);
    if (exists) {
      addSelector = sel;
      console.log(`  ℹ Found add-to-cart button: ${sel}`);
      break;
    }
  }

  if (!addSelector) {
    return { added: false, verified: false, reason: "add-to-cart not found" };
  }

  const label = await page
    .$eval(addSelector, (el) => el.textContent.trim())
    .catch(() => "");
  if (!label || !label.includes("Add to cart")) {
    return {
      added: false,
      verified: false,
      reason: `unexpected label: ${label}`,
    };
  }

  console.log('  ⏳ Waiting for "Add to cart" button to be enabled...');
  const enabled = await page
    .waitForFunction(
      (sel) => {
        const btn = document.querySelector(sel);
        return btn && !btn.disabled && !btn.classList.contains('ud-btn-disabled');
      },
      { timeout: verifyTimeout },
      addSelector
    )
    .then(() => true)
    .catch(() => false);

  if (!enabled) {
    return { added: false, verified: false, reason: "button-not-enabled" };
  }
  console.log('  ✓ Button is now enabled');

  const clicked = await safeClick(page, addSelector, {
    retries: 3,
    baseTimeout: 5000,
  });
  if (!clicked) {
    return { added: false, verified: false, reason: "click failed" };
  }

  console.log('  ⏳ Waiting for button to change to "Go to cart"...');
  const verified = await page
    .waitForFunction(
      (sel) => {
        const btn = document.querySelector(sel);
        return btn && btn.textContent.trim() === "Go to cart";
      },
      { timeout: verifyTimeout },
      addSelector
    )
    .then(() => true)
    .catch(() => false);

  return {
    added: true,
    verified,
    reason: verified ? null : "text-change-timeout",
  };
}

module.exports = {
  acceptCookies,
  safeClick,
  addCourseToCart,
};
