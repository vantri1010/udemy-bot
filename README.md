# Udemy Coupon Bot 🎓

An automated bot that scrapes Udemy coupon links from multiple coupon aggregator websites, filters out already-purchased courses, and identifies free/discounted courses available for enrollment.

## 📋 Overview

This project automates the tedious process of finding and tracking Udemy courses with active discount coupons. It:

1. **Scrapes coupon sites** (freewebcart.com, inventhigh.net, onlinecourses.ooo) for Udemy course links
2. **Maintains a checkpoint** of processed coupons to avoid duplicates
3. **Fetches your purchased courses** directly from Udemy API
4. **Filters results** to show only courses you haven't purchased yet
5. **Detects free/discounted courses** by inspecting the course page DOM
6. **Try adding a course to cart (optional)**. Controlled via CLI flag `--add-to-cart`.
7. **Saves results and progress** : Save the Udemy courses and coupons to the `to_checkout.json` file. Update the last index of checkpoint so you can resume from the checkpoint file and purchased courses.

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

**Edit `src/config/browser.js`** to set your Chrome profile path:

```javascript
module.exports = {
  USER_DATA_DIR: "C:/Users/YOUR_USERNAME/AppData/Local/Google/Chrome/User Data",
  PROFILE_DIR: "Profile 1", // or "Default" or your profile name
};
```

**How to find your Chrome profile**:
- Windows: `C:\Users\[YourUsername]\AppData\Local\Google\Chrome\User Data`
- Mac: `~/Library/Application Support/Google/Chrome`
- Linux: `~/.config/google-chrome`

**Profile names**: Usually "Default", "Profile 1", "Profile 2", etc. Check the folders in your User Data directory.

## ⚙️ Configuration

### `src/config/sites.js`
Add or remove coupon aggregator sites. The number of pages per site to scrape (`maxPages`) should be specified:
```javascript
module.exports = [
  { url: "https://inventhigh.net/freecoupon", type: "inventhigh", maxPages: 1 },
  { url: "https://www.discudemy.com/language/english", type: "discudemy", maxPages: 2 },
  { url: "https://www.onlinecourses.ooo", type: "onlinecourses", maxPages: 3 },
];
```

**To disable a problematic site**, comment it out:
```javascript
module.exports = [
  { url: "https://freewebcart.com/", type: "freewebcart", maxPages: 1 },
  // { url: "https://inventhigh.net/freecoupon", type: "inventhigh", maxPages: 1 }, // Temporarily down
];
```

### Retry Configuration
Edit in individual scraper modules (`src/scrape/*.js`):
```javascript
const MAX_RETRIES = 3;  // Number of retry attempts on failure
```

### Running the Bot

**Typical Workflow**:
```bash
# Step 1: Scrape new coupons from aggregator sites
node bot.js

# Step 1 (parallel mode - faster but more resource-intensive)
node bot.js --parallel

# Step 2: Filter purchased courses and find free ones
node fetch_and_check.js

# Step 2 (with auto add-to-cart)
node fetch_and_check.js --add-to-cart

# Or run both together (recommended)
node bot.js && node fetch_and_check.js
```

**Bot.js CLI Options**:
```bash
# Sequential mode (default) - processes sites one at a time
node bot.js

# Parallel mode - processes all sites simultaneously (faster)
node bot.js --parallel
node bot.js -p

# Concurrent detail pages - process N detail pages at once (default: 3)
node bot.js --concurrent-details=5

# Combine flags for maximum speed
node bot.js --parallel --concurrent-details=10
```

**When to use parallel vs sequential**:
- **Sequential (default)**: Safer, uses less memory, better for stability
- **Parallel (`--parallel`)**: Faster execution but uses more resources and browser tabs

**Concurrent Detail Page Processing**:
- **`--concurrent-details=N`**: Controls how many detail pages are processed simultaneously per site
- **Default**: 3 concurrent detail pages
- **Higher values (5-10)**: Faster scraping but more memory/CPU usage
- **Lower values (1-2)**: Slower but more stable on low-resource systems
- **Example**: With `--concurrent-details=3`, if a site has 10 detail pages, they're processed in batches: 3+3+3+1
- **Best practice**: Start with default (3), increase if you have good internet/system specs

**Manual Usage Tips**:

1. **Initial Setup** (First Time):
   ```bash
   npm install
   # Edit src/config/browser.js with your Chrome profile path
   node fetch_and_check.js  # Will prompt for Udemy login
   ```

2. **Daily Coupon Hunt**:
   ```bash
   # Sequential (safer)
   node bot.js && node fetch_and_check.js
   
   # Parallel (faster)
   node bot.js --parallel && node fetch_and_check.js
   
   # Maximum speed (parallel sites + concurrent details)
   node bot.js --parallel --concurrent-details=5 && node fetch_and_check.js
   
   # Check data/output/to_checkout.json for results
   ```

3. **Resume Interrupted Run**:
   - Both scripts auto-resume from last position
   - `bot.js` resumes from checkpoint
   - `fetch_and_check.js` resumes from `lastProcessedIndex`

4. **Add-to-cart toggle**:

```bash
# Detect free courses only (default)
node fetch_and_check.js

# Detect and attempt to add free courses to cart
node fetch_and_check.js --add-to-cart
```

5. **Refresh Purchased Cache**:
   ```bash
   # Delete cache to force re-fetch from Udemy
   rm data/cache/udemy_purchased.json
   node fetch_and_check.js
   ```

6. **Reset Everything**:
   ```bash
   # Start fresh (loses all progress)
   rm -rf data/
   node bot.js && node fetch_and_check.js
   ```

**Browser Visibility**:
- Scripts run with `headless: false` (browser visible)
- This helps bypass Cloudflare detection
- You can watch the scraping process
- **Do not close the browser manually** - let scripts finish

## 📊 Data Files

### `data/checkpoint.json`
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
- **`processed`**: Array of all coupon URLs found
- **`lastProcessedIndex`**: Last index checked by `fetch_and_check.js` (for resume)

### `data/output/to_checkout.json`
Output file: Free/available courses ready for enrollment:
```json
[
  "https://www.udemy.com/course/python-basics/?couponCode=FREE2025",
  "https://www.udemy.com/course/web-design/?couponCode=DEAL50",
  "..."
]
```
**This is your final result** - open these URLs to enroll in free courses!

### `data/cache/udemy_purchased.json`
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
- **`lastFetchedPage`**: Resume point for API pagination
- **`purchdLinks`**: Your purchased courses (used for filtering)

### `data/cookies/udemy_cookies.json`
Saved Udemy session cookies (auto-generated on first login):
```json
[
  { "name": "cookie_name", "value": "cookie_value", "domain": ".udemy.com", ... },
  ...
]
```
**⚠️ Keep this file secure** - contains your Udemy session. Delete to force re-login.

---

## 🐛 Troubleshooting

### Script Errors

### "Unauthorized (status 401)" on Udemy API
- **Cookies expired** → delete `data/cookies/udemy_cookies.json` and re-run
- **Login incomplete** → Ensure you completed 2FA/email verification during first login
- **Solution**: 
  ```bash
  rm data/cookies/udemy_cookies.json
  node fetch_and_check.js  # Complete full login process
  ```

### "Cannot find Chrome profile"
- Update `USER_DATA_DIR` in `src/config/browser.js`
- Verify Chrome profile exists:
  - Windows: `C:\Users\[YourUsername]\AppData\Local\Google\Chrome\User Data`
  - Mac: `~/Library/Application Support/Google/Chrome`
  - Linux: `~/.config/google-chrome`
- Check folder names: "Default", "Profile 1", "Profile 2"

### "No courses found" or Empty Output
- Verify `data/checkpoint.json` has entries (run `node bot.js` first)
- Check Udemy login is valid (check `data/cookies/udemy_cookies.json` exists)
- Try running both scripts: `node bot.js && node fetch_and_check.js`

### "Module not found" Error
- Run `npm install` to install dependencies
- Check you're in the correct directory: `cd udemy-bot`

### Script Hangs or Freezes
- **On freewebcart.com**: "Load More" button may not appear - script will timeout after 20s
- **On inventhigh.net**: Pagination may end earlier than expected
- **On onlinecourses.ooo**: Cloudflare challenges can cause delays
- **Solution**: Let script timeout naturally or press `Ctrl+C` twice to force quit

### High Memory Usage / Browser Crashes
- **In parallel mode**: Multiple browser tabs open simultaneously
- **With high concurrent-details**: Too many detail pages processed at once
- **Solution**: Use sequential mode (default) instead:
  ```bash
  node bot.js  # Without --parallel flag
  ```
- **Alternative**: Reduce concurrency:
  ```bash
  node bot.js --concurrent-details=2  # Lower from default 3
  ```
- **Another option**: Reduce `maxPages` in `src/config/sites.js` when using `--parallel`

---

### External Website Issues (Not Script Bugs)

These are common issues caused by the coupon aggregator sites themselves:

#### ⚠️ **Long Advertisement Pages**
**Symptom**: Browser stuck on redirect/ad pages for 30+ seconds.
- **Cause**: Coupon sites use multiple ad redirects before reaching Udemy
- **Impact**: Slows down scraping significantly
- **Solution**: 
  - Script has 30s timeout and will skip problematic links
  - Consider using AdBlocker plugin (already included)
  - Manual workaround: Close ad tabs if script seems stuck

#### ⚠️ **Website Maintenance/Downtime**
**Symptom**: "Site can't be reached" or "503 Service Unavailable"
- **Cause**: Coupon aggregator sites go down for maintenance
- **Impact**: That specific site will be skipped
- **Solution**:
  - Check site manually in browser first
  - Comment out problematic site in `src/config/sites.js`:
    ```javascript
    module.exports = [
      { url: "https://freewebcart.com/", type: "freewebcart" },
      // { url: "https://onlinecourses.ooo", type: "onlinecourses" }, // Down
    ];
    ```
  - Retry later (sites usually recover within hours)

#### ⚠️ **Changed Website Structure**
**Symptom**: Script finds 0 courses from a specific site that usually works
- **Cause**: Website redesigned their HTML structure
- **Impact**: Scraper can't find course links anymore
- **Solution**:
  - Verify manually: Visit site in browser, check if courses are visible
  - If site structure changed, scraper module needs updating
  - Temporary: Disable that site in `src/config/sites.js`
  - Report issue with site URL and date

#### ⚠️ **Expired/Invalid Tracking Links**
**Symptom**: Tracking URL resolves to 404 or generic Udemy page
- **Cause**: Coupon aggregators cache old/broken affiliate links
- **Impact**: Some coupons won't resolve correctly
- **Solution**:
  - Script automatically skips invalid links
  - Check `data/checkpoint.json` - might have valid coupons mixed with bad ones
  - Run `fetch_and_check.js` to filter only working free courses

#### ⚠️ **CAPTCHA Challenges**
**Symptom**: Script stops with "Please complete CAPTCHA" message
- **Cause**: Site requires human verification
- **Impact**: Can't proceed automatically
- **Solution**:
  - **Manual**: Complete CAPTCHA in the browser window
  - Script may resume after successful verification
  - Some sites can't be fully automated - consider manual scraping

---

### Best Practices to Avoid Issues

1. **Test Login First**:
   ```bash
   node fetch_and_check.js
   # Complete login, verify cookies saved
   # Then run full workflow
   ```

2. **Check Sites Manually**:
   - Before running bot, visit sites in regular Chrome
   - Verify they're accessible and loading properly
   - Check if Cloudflare/CAPTCHA appears

3. **Start Small**:
   - Set `maxPages = 2` for the site you want to test, and comment others in the `sites.js` for testing
   - Increase after confirming everything works

4. **Monitor First Run**:
   - Watch browser during first `bot.js` run
   - Note which sites work/fail
   - Disable problematic sites temporarily

5. **Regular Maintenance**:
   - Clear cache weekly: `rm data/cache/udemy_purchased.json`
   - Refresh cookies monthly: `rm data/cookies/udemy_cookies.json`
   - Update scrapers if sites change structure
