// ads.js - common ad popup handler
const { sleep } = require("./time");

// A comprehensive set of selectors for close/skip buttons across providers
const CLOSE_SELECTORS = [
  '[id*="dismiss"]',
  '[class*="dismiss"]',
  'button[aria-label="Close"]',
  'button[aria-label="Close ad"]',
  'div[aria-label="Close"]',
  'div[aria-label="Close ad"]',
  'div[role="button"][aria-label="Close"]',
  ".close, .close-btn, .btn-close, .modal-close",
  'button.skip, .skip-ad, [id*="skip"], [class*="skip"]',
  ".videoAdUiSkipButton",
  ".ytp-ad-skip-button",
  ".ytp-ad-overlay-close-button",
  'svg[aria-label="Close"], span[aria-label="Close"]',
  '[onclick*="close"], [onclick*="skip"]',
].join(", ");

const SIMPLE_CLOSE_SELECTORS = [
  "#dismiss-button",
  "#dismiss-button-element",
].join(", ");

const START_AD_SELECTORS = [
  "button.fc-rewarded-ad-button",
  ".fc-list-item-button",
  "button.watch-ad, .watch-ad",
  'button[aria-label*="Watch"], [data-action*="ad"]',
  ".fc-rewarded-ad-option-text",
].join(", ");

async function handleAdPopup(page) {
  // === 1. Popup bắt buộc xem quảng cáo 30s ===
  const unlockPopup = await page.$('div.fc-monetization-dialog, h1.fc-dialog-headline-text, [aria-label*="Unlock Free Udemy"]');
  if (unlockPopup) {
    console.log('Phát hiện popup "Unlock Free Udemy Courses" → xem quảng cáo 30s');
    const watchBtn = await page.$(START_AD_SELECTORS);
    if (watchBtn) {
      await watchBtn.click({ delay: 300 });
      console.log('Đã bấm "Watch Ad – Get Access"');
      await sleep(3000);

      try {
        await page.waitForSelector(CLOSE_SELECTORS, {
          visible: true,
          timeout: 31000,
        });
        const closeBtn = await page.$(CLOSE_SELECTORS);
        if (closeBtn) {
          const isClickable = await closeBtn.evaluate((el) => {
            const style = window.getComputedStyle(el);
            return (
              !el.disabled &&
              style.pointerEvents !== "none" &&
              style.display !== "none"
            );
          });

          if (isClickable) {
            await closeBtn.click({ delay: 300 });
          } else {
            console.log("Nút đóng chưa sẵn sàng, chờ thêm...");
            await page.waitForFunction(
              (selector) => {
                const el = document.querySelector(selector);
                if (!el) return false;
                const style = window.getComputedStyle(el);
                return (
                  !el.disabled &&
                  style.pointerEvents !== "none" &&
                  style.display !== "none"
                );
              },
              { timeout: 30000 },
              CLOSE_SELECTORS
            );
            const readyBtn = await page.$(CLOSE_SELECTORS);
            if (readyBtn) await readyBtn.click({ delay: 300 });
          }
        }
        console.log("Đã đóng quảng cáo 30s thành công!");
        await sleep(1000);
        return true;
      } catch (e) {
        console.log("Quảng cáo 30s không đóng được → thử reload");
        return false;
      }
    }
  }

  // === 2. Popup thường (có thể tắt ngay) ===
  const normalClose = await page.$(SIMPLE_CLOSE_SELECTORS);
  if (normalClose) {
    await normalClose.click();
    console.log("Đã đóng popup thường");
    await sleep(1000);
    return true;
  }

  console.log("Không có quảng cáo → truy cập ngay!");
  return true;
}

module.exports = { handleAdPopup };