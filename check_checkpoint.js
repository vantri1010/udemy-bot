// check_checkpoint.js
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

const fs = require('fs');

// === PROFILE ===
const USER_DATA_DIR = "C:/Users/tris/AppData/Local/Google/Chrome/User Data";
const PROFILE_DIR = "Profile 1";

// === FILE ===
const CHECKPOINT_FILE = 'checkpoint.json';
const OUTPUT_FILE = 'to_checkout.json';
const PROGRESS_FILE = 'progress.json';

// === NGỦ ===
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// === HÀM CHÍNH ===
async function main() {
  console.log('Bắt đầu kiểm tra → chỉ lưu CHƯA CHECKOUT...\n');

  const browser = await puppeteer.launch({
    headless: false,
    userDataDir: USER_DATA_DIR,
    defaultProfile: PROFILE_DIR,
    args: ['--no-sandbox', '--start-maximized'],
    defaultViewport: null
  });

  const page = await browser.newPage();

  const data = JSON.parse(fs.readFileSync(CHECKPOINT_FILE, 'utf-8'));
  const links = data.processed || [];
  
  // Đọc progress nếu có
  let startIndex = 0;
  let results = [];
  if (fs.existsSync(PROGRESS_FILE)) {
    const progress = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf-8'));
    startIndex = (progress.lastProcessedIndex || -1) + 1;
    results = progress.processedLinks || [];
    console.log(`Phát hiện tiến trình cũ → tiếp tục từ vị trí ${startIndex}/${links.length}\n`);
  }

  console.log(`Tìm thấy ${links.length} link → kiểm tra từ ${startIndex}...\n`);

  for (let i = startIndex; i < links.length; i++) {
    const link = links[i];
    const courseName = decodeURIComponent(link.split('/course/')[1]?.split('/')[0] || 'unknown').replace(/-/g, ' ');
    console.log(`[${i + 1}/${links.length}] Kiểm tra: ${courseName}`);

    let status = 'Lỗi';
    try {
      await page.goto(link, { waitUntil: 'networkidle2', timeout: 60000 });
      await sleep(2000); // Đợi render đầy đủ

      // DÙNG JS ĐỂ KIỂM TRA CHÍNH XÁC
      const buttonStatus = await page.evaluate(() => {
        // 1. Go to course → ĐÃ CHECKOUT
        const goToCourseBtn = Array.from(document.querySelectorAll('button[data-purpose="buy-this-course-button"]'))
          .find(btn => btn.querySelector('span.ud-btn-label')?.textContent.trim() === 'Go to course');
        if (goToCourseBtn) return 'ĐÃ CHECKOUT';

        // 2. Enroll now → CHƯA CHECKOUT
        const enrollNowBtn = Array.from(document.querySelectorAll('button[data-purpose="buy-this-course-button"]'))
          .find(btn => btn.querySelector('span.ud-btn-label')?.textContent.trim() === 'Enroll now');
        if (enrollNowBtn) return 'CHƯA CHECKOUT';

        // 3. Không tìm thấy
        return 'HẾT HẠN / KHÔNG TÌM THẤY';
      });

      status = buttonStatus;

      if (status === 'CHƯA CHECKOUT') {
        console.log(`  → CHƯA CHECKOUT → lưu\n`);
        results.push({ link, course: courseName, status });
      } else {
        console.log(`  → ${status} → bỏ qua\n`);
      }

    } catch (e) {
      console.log(`  → Lỗi mạng → bỏ qua\n`);
    }

    // Lưu progress sau mỗi link
    fs.writeFileSync(PROGRESS_FILE, JSON.stringify({
      lastProcessedIndex: i,
      processedLinks: results
    }, null, 2));
  }

  // SẮP XẾP THEO TÊN KHÓA HỌC
  results.sort((a, b) => a.course.localeCompare(b.course));

  // LƯU KẾT QUẢ
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(results, null, 2));
  
  // // Xóa file progress khi hoàn thành
  // if (fs.existsSync(PROGRESS_FILE)) {
  //   fs.unlinkSync(PROGRESS_FILE);
  // }
  
  console.log(`HOÀN THÀNH!`);
  console.log(`→ ${results.length} khóa CHƯA CHECKOUT`);
  console.log(`→ Lưu tại: ${OUTPUT_FILE}\n`);

  await browser.close();
}

main().catch(err => {
  console.error('Lỗi nghiêm trọng:', err);
  process.exit(1);
});