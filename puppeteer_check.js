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
const UDEMY_COOKIES_FILE = 'udemy_cookies.json';

// === NGỦ ===
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// === KIỂM TRA LOGIN UDEMY ===
async function ensureUdemyLogin(browser) {
  const loginPage = await browser.newPage();
  
  try {
    // Load cookies nếu có
    if (fs.existsSync(UDEMY_COOKIES_FILE)) {
      const cookies = JSON.parse(fs.readFileSync(UDEMY_COOKIES_FILE, 'utf-8'));
      await loginPage.setCookie(...cookies);
      console.log('Đã load cookies Udemy');
    } else {
      console.log('\n🔑 LẦN CHẠY ĐẦU TIÊN - VUI LÒNG ĐĂNG NHẬP UDEMY');
      console.log('📱 Trình duyệt sẽ mở trang đăng nhập Udemy');
      console.log('⏳ Vui lòng đăng nhập và nhấn Enter để tiếp tục...\n');
      
      await loginPage.goto('https://www.udemy.com/', { waitUntil: 'networkidle2' });
      
      // Chờ người dùng đăng nhập bằng cách kiểm tra URL
      await loginPage.waitForNavigation({ waitUntil: 'networkidle2', timeout: 0 }).catch(() => {});
      
      // Hoặc chờ cho đến khi user nhập vào console
      console.log('⏳ Chờ đăng nhập hoàn tất... (nhấn Enter trên console khi hoàn thành)\n');
      await new Promise(resolve => {
        const readline = require('readline');
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout
        });
        rl.question('Nhấn Enter khi đã đăng nhập xong: ', () => {
          rl.close();
          resolve();
        });
      });
      
      // Lưu cookies sau khi đăng nhập
      const cookies = await loginPage.cookies();
      fs.writeFileSync(UDEMY_COOKIES_FILE, JSON.stringify(cookies, null, 2));
      console.log('✅ Đã lưu cookies Udemy\n');
    }
  } finally {
    await loginPage.close();
  }
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

  // Kiểm tra và đăng nhập Udemy nếu cần
  await ensureUdemyLogin(browser);

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
      
      // Đợi button "Enroll now" hoặc "Go to course" xuất hiện
      try {
        await page.waitForSelector('button[data-purpose="buy-this-course-button"]', { timeout: 15000 });
        console.log(`  ⏳ Đã tìm thấy button`);
      } catch (e) {
        console.log(`  ⚠️  Không tìm thấy button sau 15s`);
        throw new Error('Button không xuất hiện');
      }

      await sleep(1000); // Đợi render đầy đủ

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
      console.log(`  → Lỗi: ${e.message} → bỏ qua\n`);
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