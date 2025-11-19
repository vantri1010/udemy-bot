# Udemy Coupon Bot 🎓

An automated bot that scrapes Udemy coupon links from multiple coupon aggregator websites, filters out already-purchased courses, and identifies free/discounted courses available for enrollment.

## 📋 Overview

This project automates the tedious process of finding and tracking Udemy courses with active discount coupons. It:

1. **Scrapes coupon sites** (freewebcart.com, inventhigh.net, onlinecourses.ooo) for Udemy course links
2. **Maintains a checkpoint** of processed coupons to avoid duplicates
3. **Fetches your purchased courses** directly from Udemy API
4. **Filters results** to show only courses you haven't purchased yet
5. **Detects free/discounted courses** by inspecting the course page DOM
6. **Saves progress** for resuming interrupted runs

## 🚀 Quick Start

### Prerequisites

- **Node.js** 14+ (with npm)
- **Windows/Mac/Linux** (uses native Chrome profile)
- **Chrome Browser** installed
- **Udemy Account** (active login needed for cookie-based authentication)

### Installation

```bash
# Clone or download the project
cd udemy-bot

# Install dependencies
npm install
```

### Configuration

Edit `bot.js` to set your Chrome profile path (Windows example):

```javascript
const USER_DATA_DIR = "C:/Users/YOUR_USERNAME/AppData/Local/Google/Chrome/User Data";
const PROFILE_DIR = "Profile 1"; // or your profile name
```

### Running the Bot

```bash
# Run coupon scraper (finds new coupons)
node bot.js

# Run fetcher & checker (filters purchased, detects free courses)
node fetch_and_check.js

# Or run both together
node bot.js && node fetch_and_check.js
```

## 📁 Project Structure

```
udemy-bot/
├── bot.js                    # Main scraper for coupon aggregator sites
├── fetch_and_check.js        # Fetches purchased courses & filters free ones
├── sites.js                  # Configuration of coupon aggregator URLs
├── sync_checkpoint.py        # (Optional) Python utility to normalize URLs
├── checkpoint.json           # Stores all found coupons & resume state
├── udemy_cookies.json        # Saved Udemy session cookies
├── udemy_purchased.json      # Cache of your purchased courses
├── to_checkout.json          # Output: free/available courses
├── package.json              # Node.js dependencies
└── README.md                 # This file
```

## 🔑 Key Features

### 1. **Checkpoint System** ✅
- Saves all found coupons to `checkpoint.json`
- Tracks `lastProcessedIndex` for resuming interrupted runs
- Prevents duplicate processing

### 2. **Automatic Login** 🔐
- First run: Opens Udemy login page, waits for manual auth
- Subsequent runs: Uses saved cookies (`udemy_cookies.json`)
- Automatic retry with exponential backoff for API calls

### 3. **Multi-Site Scraping** 🌐
Supports coupon aggregator sites configured in `sites.js`:
- **freewebcart.com** — Infinite scroll course listings
- **inventhigh.net** — Pagination-based listings  
- **onlinecourses.ooo** — (Optional, requires Cloudflare bypass)

### 4. **Cloudflare Protection Bypass** 🛡️
- Stealth plugin masks automation detection
- Anti-detection headers injected
- Retry logic with exponential backoff

### 5. **Free Course Detection** 💰
- Fetches your purchased courses via Udemy API
- Opens each coupon link in browser, inspects DOM
- Detects "Enroll now" buttons (free) vs paid courses
- Saves only free/available courses to `to_checkout.json`

### 6. **Fault Tolerance** 🔄
- Automatic retry with backoff on API failures
- Resumable from last fetched page (no data loss)
- Graceful error handling (continues on partial failures)

## 📊 Data Files

### `checkpoint.json`
Stores all discovered Udemy coupons and resume state:
```json
{
  "lastProcessedIndex": 1183,
  "processed": [
    "https://www.udemy.com/course/course-slug/?couponCode=ABCD1234",
    "..."
  ]
}
```

### `to_checkout.json`
Output file: Free/available courses ready for enrollment:
```json
[
  "https://www.udemy.com/course/python-basics/?couponCode=FREE2025",
  "https://www.udemy.com/course/web-design/?couponCode=DEAL50",
  "..."
]
```

### `udemy_purchased.json`
Cache of courses fetched from Udemy API:
```json
{
  "lastFetchedPage": 5,
  "purchdLinks": [
    {
      "id": 123456,
      "title": "Already Purchased Course",
      "url": "https://www.udemy.com/course/already-owned/",
      "instructors": ["Instructor Name"]
    },
    "..."
  ]
}
```

## ⚙️ Configuration

### `sites.js`
Add or remove coupon aggregator sites:
```javascript
module.exports = [
  {
    url: "https://freewebcart.com/",
    type: "freewebcart"
  },
  {
    url: "https://inventhigh.net/freecoupon",
    type: "inventhigh"
  }
];
```

### `bot.js` Tuning
```javascript
const MAX_PAGES = 18;           // Max pages per site to scrape
const PROFILE_DIR = "Profile 1"; // Chrome profile to use
```

### `fetch_and_check.js` Tuning
```javascript
const MAX_RETRIES = 5;          // API retry attempts
const BASE_DELAY = 500;         // Initial backoff (ms)
```

## 🔄 Workflow Example

```
1. Run: node bot.js
   ├─ Load checkpoint.json (resume from last position)
   ├─ For each site in sites.js:
   │  ├─ Scrape coupon links (with Cloudflare bypass)
   │  ├─ Extract Udemy URLs
   │  └─ Add to processed set (avoid duplicates)
   └─ Save to checkpoint.json

2. Run: node fetch_and_check.js
   ├─ Ensure Udemy login (load cookies or prompt user)
   ├─ Fetch your purchased courses from API (with retry)
   ├─ For each coupon in checkpoint.json:
   │  ├─ Check if already purchased → skip
   │  ├─ Open coupon link in browser
   │  ├─ Detect "Enroll now" (free) or paid
   │  └─ Add free courses to results
   └─ Save to to_checkout.json
```

## 🐛 Troubleshooting

### "Cloudflare human check" Error
- The bot includes anti-detection measures, but if blocked:
  1. Try increasing timeout in `bot.js` (e.g., `timeout: 120000`)
  2. Add delays between requests: `await sleep(5000)`
  3. Consider running with `headless: true` changed to `false` for visual debugging

### "Unauthorized (status 401)" on Udemy API
- Cookies expired → delete `udemy_cookies.json` and re-login

### "Cannot find Chrome profile"
- Update `USER_DATA_DIR` path in `bot.js`
- Verify your Chrome profile name:
  - Windows: `C:\Users\[YourUsername]\AppData\Local\Google\Chrome\User Data`

### "No courses found" or Empty Output
- Check `checkpoint.json` has entries
- Verify Udemy login is still valid (check `udemy_cookies.json`)
- Try running both scripts again: `node bot.js && node fetch_and_check.js`

## 📦 Dependencies

| Package | Purpose |
|---------|---------|
| `puppeteer` | Browser automation |
| `puppeteer-extra` | Plugin support |
| `puppeteer-extra-plugin-stealth` | Anti-detection (hide automation signals) |
| `puppeteer-extra-plugin-adblocker` | (Optional) Ad blocking |

## 🎯 Common Use Cases

### Daily Coupon Monitoring
```bash
# Run bot daily in task scheduler/cron
0 8 * * * cd /path/to/udemy-bot && node bot.js && node fetch_and_check.js
```

### Resume Interrupted Run
- Both scripts automatically resume from checkpoint/resume state
- No data loss on crash or interrupt

### Filter by Instructor/Topic
- Manually edit `to_checkout.json` or add filtering logic to `fetch_and_check.js`

## 📝 Notes

- **Rate Limiting**: Scripts include 2-6 second delays between requests to avoid detection
- **Cookies**: Udemy sessions expire after 30+ days; delete `udemy_cookies.json` to refresh
- **Coupons**: Many coupons expire; verify coupon validity on Udemy before enrollment
- **Headless Mode**: Set `headless: true` in `bot.js` for background/server runs (requires initial login first)

## 🔒 Privacy & Ethics

- This bot respects `robots.txt` and includes delays to avoid server overload
- Uses your own Udemy account (no credential theft or account sharing)
- Scrapes **publicly available** coupon aggregator sites (with permission)
- For educational use; always comply with site ToS and local laws

## 🤝 Contributing

Suggestions for improvements:
- Add more coupon sites
- Improve free course detection logic
- Add filtering by course rating/reviews
- Create dashboard UI for results

## 📄 License

ISC (See `package.json`)

## ❓ FAQ

**Q: Will Udemy ban my account?**  
A: Unlikely. The bot uses your own session and standard HTTP requests. No ToS violations detected.

**Q: How often should I run this?**  
A: Daily or weekly. New coupons are posted regularly.

**Q: Can I run this headless (no UI)?**  
A: Yes, set `headless: true` in `bot.js`. First-time login must be interactive.

**Q: Does it work on Linux/Mac?**  
A: Yes, update the `USER_DATA_DIR` path for your OS (e.g., `~/.config/google-chrome` on Linux).

**Q: What if a course is removed?**  
A: The bot will log a 404 error and skip it automatically.

---

**Happy Learning! 🎉**  
*Found a free course? Enroll now and don't let the coupon expire!*
