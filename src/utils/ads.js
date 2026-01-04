// ads.js - Optimized ad popup handler
const { sleep } = require('./time');

// Consolidated selectors
const CLOSE_SELECTORS = [
  '#dismiss-button-element', '#dismiss-button', '#close-button',
  '[id*="dismiss"]', '[class*="dismiss"]',
  'button[aria-label="Close"]', 'button[aria-label="Close ad"]',
  'div[aria-label="Close"]', 'div[aria-label="Close ad"]',
  'div[role="button"][aria-label="Close ad"]',
  '.button-common.close-button', 'div[class*="close"][role="button"]',
  '.close, .close-btn, .btn-close, .modal-close, .close-button',
  '.btn.skip',
  'button.skip, .skip-ad, [id*="skip"], [class*="skip"]',
  '.videoAdUiSkipButton', '.ytp-ad-skip-button', '.ytp-ad-overlay-close-button',
  'svg[aria-label="Close"], span[aria-label="Close"]',
  '[onclick*="close"], [onclick*="skip"]',
  '#close-ad-button', '#resume-ad-button'
].join(', ');

const START_AD_SELECTORS = [
  'button.fc-rewarded-ad-button', 'button.fc-list-item-button', '.fc-list-item-button',
  'button.watch-ad, .watch-ad',
  'button[aria-label*="Watch"], [data-action*="ad"]',
  '.fc-rewarded-ad-option-text'
].join(', ');

const AD_CONTAINER_SELECTORS = [
  '#ad_position_box', '#ad_iframe', 'iframe[title="Advertisement"]',
  '#mys-wrapper', '#mys-content', '#mys-overlay'
].join(', ');

// Find first visible and clickable element across all frames
async function findClickableAcrossFrames(page, selectors) {
  const frames = page.frames();
  for (const frame of frames) {
    try {
      const elements = await frame.$$(selectors);
      for (const el of elements) {
        const isClickable = await el.evaluate((node) => {
          const style = window.getComputedStyle(node);
          const rect = node.getBoundingClientRect();
          return (
            rect.width > 0 && rect.height > 0 &&
            !node.disabled &&
            style.pointerEvents !== 'none' &&
            style.display !== 'none' &&
            style.visibility !== 'hidden'
          );
        }).catch(() => false);
        if (isClickable) return el;
      }
    } catch {} // Frame may be invalid
  }
  return null;
}

// Find any matching element across frames (existence only)
async function findElementAcrossFrames(page, selectors) {
  const frames = page.frames();
  for (const frame of frames) {
    try {
      const el = await frame.$(selectors);
      if (el) return el;
    } catch {}
  }
  return null;
}

// Close Google vignette overlay
async function closeGoogleVignette(page) {
  const TIMEOUT_MS = 8000;
  const start = Date.now();
  while (Date.now() - start < TIMEOUT_MS) {
    const hasVignette = await page.evaluate(() => location.hash.includes('google_vignette')).catch(() => false);
    const closeBtn = await findClickableAcrossFrames(page, CLOSE_SELECTORS);
    if (!hasVignette && !closeBtn) return false;
    if (closeBtn) {
      await closeBtn.click({ delay: 150 }).catch(() => {});
      await sleep(400);
      return true;
    }
    await sleep(350);
  }
  return false;
}

// Unified ad close function
async function tryCloseAd(page) {
  const prioritySelector = '#dismiss-button-element';
  const priorityBtn = await findClickableAcrossFrames(page, prioritySelector);
  if (priorityBtn) {
    await priorityBtn.click({ delay: 300 }).catch(() => {});
    console.log('Closed ad (priority selector)');
    await sleep(500);
    await handleCloseConfirmationDialog(page);
    return true;
  }

  const closeBtn = await findClickableAcrossFrames(page, CLOSE_SELECTORS);
  if (closeBtn) {
    await closeBtn.click({ delay: 300 }).catch(() => {});
    console.log('Closed ad');
    await sleep(500);
    await handleCloseConfirmationDialog(page);
    return true;
  }
  return false;
}

// Handle post-close confirmation dialog
async function handleCloseConfirmationDialog(page) {
  const dialog = await page.$('#close-confirmation-dialog, [aria-labelledby="confirmation-title"]');
  if (dialog) {
    const confirmBtn = await dialog.$('#close-ad-button');
    if (confirmBtn) {
      await confirmBtn.click({ delay: 300 });
      console.log('Confirmed ad close');
      await sleep(1000);
      return true;
    }
  }
  return false;
}

// Main handler
async function handleAdPopup(page) {
  try {
    // Handle vignette first
    if (await closeGoogleVignette(page)) {
      console.log('Closed Google vignette overlay');
      await sleep(500);
    }

    // Check for unlock popup requiring ad view
    const unlockPopup = await page.$('div.fc-monetization-dialog, h1.fc-dialog-headline-text, [aria-label*="Unlock Free Udemy"], .fc-dialog-headline-text, #mys-wrapper');
    if (unlockPopup) {
      console.log('Detected unlock popup - starting rewarded ad');
      const watchBtn = await page.$(START_AD_SELECTORS);
      if (watchBtn) {
        await watchBtn.click({ delay: 300 });
        console.log('Clicked "Watch Ad"');
        await sleep(3000); // Wait for ad to load

        // Wait and poll for close opportunity
        const MAX_WAIT_MS = 45000; // ~45s total
        const startTime = Date.now();
        while (Date.now() - startTime < MAX_WAIT_MS) {
          if (await tryCloseAd(page)) {
            await sleep(2000);
            return true;
          }
          // Optional: early exit if ad container is gone
          const adContainer = await findElementAcrossFrames(page, AD_CONTAINER_SELECTORS);
          if (!adContainer) {
            console.log('Ad container disappeared - assuming closed');
            return true;
          }
          await sleep(2000); // Poll every 2 seconds
        }
        console.warn('Failed to close ad within timeout');
        return false;
      }
    }

    // Handle simple closeable popup
    const simpleClose = await page.$(CLOSE_SELECTORS); // Use full set for immediate close
    if (simpleClose) {
      await simpleClose.click({ delay: 300 });
      console.log('Closed simple popup');
      await sleep(1000);
      return true;
    }

    return true; // No ad found or handled successfully
  } catch (err) {
    if (err.message.includes('Execution context was destroyed')) {
      console.log('Page context destroyed - ad handling skipped');
      return false;
    }
    console.error('Unexpected error in ad handling:', err.message);
    return false;
  }
}

module.exports = { handleAdPopup };