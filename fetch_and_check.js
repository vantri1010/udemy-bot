// check_checkpoint.js
const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
puppeteer.use(StealthPlugin());

const fs = require("fs");

// === PROFILE ===
const USER_DATA_DIR = "C:/Users/tris/AppData/Local/Google/Chrome/User Data";
const PROFILE_DIR = "Profile 1";

// === FILE ===
const CHECKPOINT_FILE = "checkpoint.json";
const OUTPUT_FILE = "to_checkout.json";
const UDEMY_COOKIES_FILE = "udemy_cookies.json";
const PURCHASED_FILE = "udemy_purchased.json";

// === NGỦ ===
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// === KIỂM TRA LOGIN UDEMY ===
async function ensureUdemyLogin(browser) {
  const loginPage = await browser.newPage();

  try {
    // Load cookies nếu có
    if (fs.existsSync(UDEMY_COOKIES_FILE)) {
      const cookies = JSON.parse(fs.readFileSync(UDEMY_COOKIES_FILE, "utf-8"));
      await loginPage.setCookie(...cookies);
      console.log("🍪👍 Đã load cookies Udemy");
    } else {
      console.log("\n🔑 LẦN CHẠY ĐẦU TIÊN - VUI LÒNG ĐĂNG NHẬP UDEMY");
      console.log("📱 Trình duyệt sẽ mở trang đăng nhập Udemy");
      console.log("⏳ Vui lòng đăng nhập và nhấn Enter để tiếp tục...\n");

      await loginPage.goto("https://www.udemy.com/", {
        waitUntil: "networkidle2",
      });

      // Chờ người dùng đăng nhập bằng cách kiểm tra URL
      await loginPage
        .waitForNavigation({ waitUntil: "networkidle2", timeout: 0 })
        .catch(() => {});

      // Hoặc chờ cho đến khi user nhập vào console
      console.log(
        "⏳ Chờ đăng nhập hoàn tất... (nhấn Enter trên console khi hoàn thành)\n"
      );
      await new Promise((resolve) => {
        const readline = require("readline");
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout,
        });
        rl.question("Nhấn Enter khi đã đăng nhập xong: ", () => {
          rl.close();
          resolve();
        });
      });

      // Lưu cookies sau khi đăng nhập
      const cookies = await loginPage.cookies();
      fs.writeFileSync(UDEMY_COOKIES_FILE, JSON.stringify(cookies, null, 2));
      console.log("✅ Đã lưu cookies Udemy\n");
    }
  } finally {
    await loginPage.close();
  }
}

// ==============================
// 1) FETCH PURCHASED COURSES
// ==============================
async function fetchPurchasedCourses(browser) {
  const page = await browser.newPage();
  console.log(
    "👀 Đang fetch danh sách khóa học purchased bằng fetch() trực tiếp..."
  );

  // Resume semantics:
  // - file stores `lastFetchedPage` (last page successfully fetched)
  // - on resume we start from lastFetchedPage + 1
  let startPage = 1;
  let cleanedPurchased = [];

  if (fs.existsSync(PURCHASED_FILE)) {
    const progress = JSON.parse(fs.readFileSync(PURCHASED_FILE, "utf-8"));
    startPage = (progress.lastFetchedPage || 0) + 1;
    cleanedPurchased = progress.purchdLinks || [];
    console.log(`⏯ Phát hiện tiến trình trước ⏯ tiếp tục từ page ${startPage}\n`);
  }

  // BẮT BUỘC load Udemy để có context đúng origin
  await page.goto("https://www.udemy.com/", {
    waitUntil: "networkidle2",
    timeout: 0,
  });

  const MAX_RETRIES = 5;
  const BASE_DELAY = 500; // ms

  async function fetchPageWithRetry(u) {
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const result = await page.evaluate(async (url) => {
          try {
            const resp = await fetch(url, {
              method: "GET",
              headers: {
                Accept: "application/json, text/plain, */*",
                "Content-Type": "application/json;charset=UTF-8",
              },
              credentials: "include",
            });

            const status = resp.status;
            let body = null;
            try {
              body = await resp.json();
            } catch (e) {
              body = null;
            }

            return { ok: resp.ok, status, body };
          } catch (err) {
            return { networkError: String(err) };
          }
        }, u);

        // network error returned from page.evaluate
        if (result && result.networkError) {
          throw new Error(result.networkError);
        }

        // Unauthorized - stop and let caller handle (likely need re-login)
        if (
          result &&
          result.status &&
          (result.status === 401 || result.status === 403)
        ) {
          throw new Error(`Unauthorized (status ${result.status})`);
        }

        // If we have a body but no results, treat as end-of-data (no retry)
        if (result && result.body && !result.body.results) {
          return result.body;
        }

        // If response ok and has body -> return
        if (result && result.ok && result.body) return result.body;

        // Otherwise treat as transient and retry
        throw new Error(
          `Unexpected response (status=${result && result.status})`
        );
      } catch (err) {
        const backoff = BASE_DELAY * Math.pow(2, attempt - 1);
        const jitter = Math.floor(Math.random() * 200);
        console.log(
          `⏸▶ Fetch attempt ${attempt} failed: ${err.message}. Retrying in ${
            backoff + jitter
          }ms`
        );
        await sleep(backoff + jitter);
      }
    }

    throw new Error(`⏭ Failed to fetch after ${MAX_RETRIES} attempts`);
  }

  let pageNum = startPage;

  while (true) {
    console.log(`➡ Fetch page ${pageNum}...`);

    const url = `https://www.udemy.com/api-2.0/users/me/subscribed-courses/?page=${pageNum}&page_size=100`;

    let json;
    try {
      json = await fetchPageWithRetry(url);
    } catch (err) {
      // save progress so next run can resume from this page
      fs.writeFileSync(
        PURCHASED_FILE,
        JSON.stringify(
          {
            lastFetchedPage: pageNum - 1,
            purchdLinks: cleanedPurchased,
          },
          null,
          2
        )
      );
      console.log(
        `⏹⏺ Lỗi khi fetch page ${pageNum}: ${err.message}. Đã lưu tiến trình để tiếp tục sau.`
      );
      throw err;
    }

    if (!json || json.error) {
      console.log(
        "❗ Lỗi khi fetch API:",
        json && json.error ? json.error : "unknown"
      );
      break;
    }

    if (!json.results) {
      console.log("⭕ Không có results. Có thể cookie hết hạn hoặc chưa login.");
      break;
    }

    // Clean and append current page results
    const cleanedPage = json.results.map((c) => ({
      id: c.id,
      title: c.title,
      url:
        "https://www.udemy.com" +
        c.url.replace(/\/$/, "").replace(/\/learn$/, ""),
      instructors: c.visible_instructors.map((i) => i.title),
    }));

    cleanedPurchased = cleanedPurchased.concat(cleanedPage);

    // Persist progress after each successful page
    fs.writeFileSync(
      PURCHASED_FILE,
      JSON.stringify(
        {
          lastFetchedPage: pageNum,
          purchdLinks: cleanedPurchased,
        },
        null,
        2
      )
    );

    console.log(
      `✅▶ Đã fetch & lưu page ${pageNum} (${cleanedPage.length} items)`
    );

    if (json.results.length < 100) break;

    pageNum++;
    await sleep(400);
  }

  console.log(`↔ Tổng purchased fetched = ${cleanedPurchased.length}`);
  console.log(`🎦✅ Đã lưu purchased ➡ ${PURCHASED_FILE}`);

  return cleanedPurchased;
}

async function isFreeCourse(browser, fullUrl) {
  const page = await browser.newPage();

  try {
    // Use the coupon URL directly and inspect the rendered page.
    // This avoids relying on the course-landing-components API which may require a different slug.

    // Apply saved cookies to this page (best-effort)
    try {
      if (fs.existsSync(UDEMY_COOKIES_FILE)) {
        const cookies = JSON.parse(
          fs.readFileSync(UDEMY_COOKIES_FILE, "utf-8")
        );
        if (Array.isArray(cookies) && cookies.length) {
          await page.setCookie(...cookies);
          await sleep(100);
        }
      }
    } catch (e) {
      console.log(
        `⚠ Warning: could not apply Udemy cookies to page: ${e.message}`
      );
    }

    // Navigate to the coupon URL (this should apply coupon and show price/button)
    try {
      await page.goto(fullUrl, { waitUntil: "networkidle2", timeout: 30000 });
    } catch (e) {
      // navigation may still partially work; continue to try reading DOM
      console.log(`⚠ Warning: navigation to coupon URL failed: ${e.message}`);
    }

    // Wait for either the buy button or some price text to appear
    try {
      await page.waitForSelector(
        'button[data-purpose="buy-this-course-button"]',
        { timeout: 15000 }
      );
      console.log(`  ⏳ Đã tìm thấy button`);
    } catch (e) {
      console.log(`  ⚠️  Không tìm thấy button sau 15s`);
    }

    await sleep(1000); // Đợi render đầy đủ

    // Evaluate DOM to determine if course is free under this coupon
    const free = await page.evaluate(() => {
      // 1) If buy button shows 'Enroll now' that's a good indicator the course is free to enroll
      const enrollNowBtn = Array.from(
        document.querySelectorAll(
          'button[data-purpose="buy-this-course-button"]'
        )
      ).find(
        (btn) =>
          btn.querySelector("span.ud-btn-label")?.textContent.trim() ===
          "Enroll now"
      );
      if (enrollNowBtn) return true;

      return false;
    });

    return !!free;
  } catch (err) {
    console.log(`⁉ isFreeCourse error for ${fullUrl}: ${err.message}`);
    return false;
  } finally {
    try {
      await page.close();
    } catch (_) {}
  }
}

// === HÀM CHÍNH ===
async function main() {
  console.log("⏯ Bắt đầu kiểm tra ➡ chỉ lưu CHƯA CHECKOUT...\n");

  const browser = await puppeteer.launch({
    headless: false,
    userDataDir: USER_DATA_DIR,
    defaultProfile: PROFILE_DIR,
    args: ["--no-sandbox", "--start-maximized"],
    defaultViewport: null,
  });

  // Kiểm tra và đăng nhập Udemy nếu cần
  await ensureUdemyLogin(browser);

  const purchased = await fetchPurchasedCourses(browser);
  const purchasedSet = new Set(
    purchased.map((c) => c.url.split("?")[0].replace(/\/$/, ""))
  );

  console.log(`ℹ Có ${purchasedSet.size} khóa purchased cần lọc.`);

  const data = JSON.parse(fs.readFileSync(CHECKPOINT_FILE, "utf-8"));
  const links = data.processed || [];

  // Resume using checkpoint.json's lastProcessedIndex (if present).
  let startIndex =
    (typeof data.lastProcessedIndex === "number"
      ? data.lastProcessedIndex
      : -1) + 1;
  if (startIndex < 0) startIndex = 0;
  if (startIndex >= links.length) startIndex = 0; // guard against stale index

  let results = [];

  console.log(`♻ Tìm thấy ${links.length} link ➡ kiểm tra từ ${startIndex}...\n`);

  for (let i = startIndex; i < links.length; i++) {
    const link = links[i];

    const courseName = decodeURIComponent(
      link.split("/course/")[1]?.split("/")[0] || "unknown"
    ).replace(/-/g, " ");

    console.log(`[${i + 1}/${links.length}] Kiểm tra: ${courseName}`);
    let normalized = link.split("?")[0].replace(/\/$/, "");

    if (purchasedSet.has(normalized)) {
      console.log(`☑ Đã mua ➡ bỏ qua: ${normalized}`);
    } else {
      const free = await isFreeCourse(browser, link);
      if (free) {
        console.log(`🆕🆓 Khóa học còn free ➡ giữ lại: ${link}`);
        results.push(link);
      } else {
        console.log(`🔃⏭ Khóa học: ${courseName} đã hết hạn`);
      }
    }

    // Ghi lastProcessedIndex vào `checkpoint.json` để có thể resume sau khi dừng
    try {
      const cp = JSON.parse(fs.readFileSync(CHECKPOINT_FILE, "utf-8"));
      cp.lastProcessedIndex = i;
      // preserve existing `processed` array and other keys
      fs.writeFileSync(CHECKPOINT_FILE, JSON.stringify(cp, null, 2));
    } catch (err) {
      // best-effort: if checkpoint can't be read/written, continue without crashing
      console.log(`🚫 Không thể cập nhật ${CHECKPOINT_FILE}: ${err.message}`);
    }
  }

  // SẮP XẾP THEO TÊN KHÓA HỌC
  results = [...new Set(results)]; // UNIQUE trước
  results.sort();

  // LƯU KẾT QUẢ
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(results, null, 2));

  console.log(`🛑 HOÀN THÀNH!`);
  console.log(`💹 ${results.length} khóa CHƯA CHECKOUT`);
  console.log(`✍ Lưu tại: ${OUTPUT_FILE}\n`);

  try {
    await browser.close();
  } catch (error) {
    console.log("💥 Browser close error (ignored):", error.message);
  }
}

main().catch((err) => {
  console.error("❌ Lỗi nghiêm trọng:", err);
  process.exit(1);
});
