// ads.js - common ad popup handler
const { sleep } = require('./time');

// A comprehensive set of selectors for close/skip buttons across providers
const CLOSE_SELECTORS = [
  // Standard dismiss buttons
  '#dismiss-button', '#dismiss-button-element', '#close-button',
  '[id*="dismiss"]', '[class*="dismiss"]',
  
  // ARIA labeled close buttons
  'button[aria-label="Close"]', 'button[aria-label="Close ad"]',
  'div[aria-label="Close"]', 'div[aria-label="Close ad"]',
  'div[role="button"][aria-label="Close ad"]',
  
  // Google ads close buttons
  '.button-common.close-button',
  'div[class*="close"][role="button"]',
  
  // Standard close classes
  '.close, .close-btn, .btn-close, .modal-close, .close-button',
  '.btn.skip',
  
  // Skip buttons
  'button.skip, .skip-ad, [id*="skip"], [class*="skip"]',
  
  // Video ad skip buttons
  '.videoAdUiSkipButton', '.ytp-ad-skip-button', '.ytp-ad-overlay-close-button',
  
  // Other close elements
  'svg[aria-label="Close"], span[aria-label="Close"]',
  '[onclick*="close"], [onclick*="skip"]',
  
  // Rewarded ad close buttons (after countdown)
  '#close-ad-button',
  '#resume-ad-button'
].join(', ');

const SIMPLE_CLOSE_SELECTORS = [
  '#dismiss-button', '#dismiss-button-element',
  'div[role="button"][aria-label="Close ad"]',
  '.button-common.close-button'
].join(', ');

const START_AD_SELECTORS = [
  // Discudemy force-to-view ad buttons
  'button.fc-rewarded-ad-button',
  'button.fc-list-item-button',
  '.fc-list-item-button',
  
  // Generic watch ad buttons
  'button.watch-ad, .watch-ad',
  'button[aria-label*="Watch"], [data-action*="ad"]',
  
  // Text content selectors
  '.fc-rewarded-ad-option-text'
].join(', ');

// Hàm thử đóng quảng cáo
async function tryCloseAd(page, intervalSecond) {
  try {
    // Ưu tiên kiểm tra #dismiss-button-element (nút đóng chính sau countdown)
    const dismissButtonElement = await page.$('#dismiss-button-element');
    if (dismissButtonElement) {
      const isVisible = await dismissButtonElement.evaluate((el) => {
        const style = window.getComputedStyle(el);
        return (
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          style.opacity !== "0"
        );
      });

      if (isVisible) {
        await dismissButtonElement.click({ delay: 300 });
        console.log(`✅ Đã đóng quảng cáo tại giây thứ ${intervalSecond} (dismiss-button-element)!`);
        
        // Kiểm tra và xử lý dialog xác nhận đóng quảng cáo (nếu có)
        await sleep(500);
        await handleCloseConfirmationDialog(page);
        
        return true;
      }
    }
    
    // Nếu không tìm thấy, thử các selector khác
    const closeBtn = await page.$(CLOSE_SELECTORS);
    if (closeBtn) {
      const isClickable = await closeBtn.evaluate((el) => {
        const style = window.getComputedStyle(el);
        return (
          !el.disabled &&
          style.pointerEvents !== "none" &&
          style.display !== "none" &&
          style.visibility !== "hidden"
        );
      });

      if (isClickable) {
        await closeBtn.click({ delay: 300 });
        console.log(`✅ Đã đóng quảng cáo tại giây thứ ${intervalSecond}!`);
        
        // Kiểm tra và xử lý dialog xác nhận đóng quảng cáo (nếu có)
        await sleep(500);
        await handleCloseConfirmationDialog(page);
        
        return true;
      }
    }
  } catch (e) {
    // Không log lỗi ở đây vì sẽ thử lại
  }
  return false;
}

// Hàm xử lý dialog xác nhận đóng quảng cáo
async function handleCloseConfirmationDialog(page) {
  try {
    // Kiểm tra xem có dialog "Close Ad?" không
    const confirmDialog = await page.$('#close-confirmation-dialog, [aria-labelledby="confirmation-title"]');
    if (confirmDialog) {
      console.log('⚠️ Phát hiện dialog xác nhận đóng quảng cáo');
      
      // Bấm nút "CLOSE" để xác nhận đóng
      const closeButton = await page.$('#close-ad-button');
      if (closeButton) {
        await closeButton.click({ delay: 300 });
        console.log('✅ Đã xác nhận đóng quảng cáo');
        await sleep(1000);
        return true;
      }
    }
  } catch (e) {
    // Không có dialog hoặc lỗi nhỏ, bỏ qua
  }
  return false;
}

async function handleAdPopup(page) {
  // === 1. Popup bắt buộc xem quảng cáo 30s ===
  const unlockPopup = await page.$('div.fc-monetization-dialog, h1.fc-dialog-headline-text, [aria-label*="Unlock Free Udemy"], .fc-dialog-headline-text, #mys-wrapper');
  if (unlockPopup) {
    console.log('🎬 Phát hiện popup "Unlock more content / Unlock Free Udemy Courses" → xem quảng cáo');
    const watchBtn = await page.$(START_AD_SELECTORS);
    if (watchBtn) {
      await watchBtn.click({ delay: 300 });
      console.log('✅ Đã bấm "View a short ad / Watch Ad"');
      await sleep(3000);

      try {
        // Đợi quảng cáo hiển thị
        console.log('⏳ Đang chờ quảng cáo tải...');
        await sleep(2000);
        
        // Kiểm tra xem có container quảng cáo không
        const adContainer = await page.$('#ad_position_box, #ad_iframe, iframe[title="Advertisement"], #mys-wrapper, #mys-content, #mys-overlay');
        if (adContainer) {
          console.log('✅ Đã phát hiện container quảng cáo');
        }

        // Thử đóng quảng cáo tại các mốc thời gian: 0s, 5s, 10s, 15s, 20s, 25s, 30s
        const intervals = [0, 5, 10, 15, 20, 25, 30];
        let adClosed = false;

        for (let i = 0; i < intervals.length; i++) {
          const currentSecond = intervals[i];
          
          // Thử đóng ngay lập tức tại mốc thời gian
          console.log(`🔍 Thử đóng quảng cáo tại giây thứ ${currentSecond}...`);
          adClosed = await tryCloseAd(page, currentSecond);
          
          if (adClosed) {
            await sleep(2000);
            return true;
          }

          // Nếu chưa phải mốc cuối cùng, đợi đến mốc tiếp theo
          if (i < intervals.length - 1) {
            const waitTime = (intervals[i + 1] - currentSecond) * 1000;
            await sleep(waitTime);
          }
        }

        // Nếu vẫn chưa đóng được sau 30s, thử đợi thêm 10s
        if (!adClosed) {
          console.log('⏳ Quảng cáo chưa đóng được, đợi thêm 10 giây...');
          await sleep(10000);
          adClosed = await tryCloseAd(page, 40);
          
          if (adClosed) {
            await sleep(2000);
            return true;
          }
        }

        console.log("⚠️ Không thể đóng quảng cáo sau tất cả các lần thử");
        return false;

      } catch (e) {
        console.log(`⚠️ Lỗi khi xử lý quảng cáo: ${e.message}`);
        return false;
      }
    }
  }

  // === 2. Popup thường (có thể tắt ngay) ===
  const normalClose = await page.$(SIMPLE_CLOSE_SELECTORS);
  if (normalClose) {
    await normalClose.click();
    console.log("✅ Đã đóng popup thường");
    await sleep(1000);
    return true;
  }
  return true;
}

module.exports = { handleAdPopup };