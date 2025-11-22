const { readJson, writeJson } = require("../utils/fsUtils");
const { FILES } = require("../config/paths");

class Checkpoint {
  constructor() {
    this.urls = [];
    this.processed = new Set();
    this.lastProcessedIndex = -1; // for fetch_and_check resume
  }

  load() {
    const data = readJson(FILES.CHECKPOINT, null, ["checkpoint.json"]);
    if (data) {
      this.urls = Array.isArray(data.processed) ? data.processed : [];
      this.lastProcessedIndex =
        typeof data.lastProcessedIndex === "number"
          ? data.lastProcessedIndex
          : -1;
      this.processed = new Set(
        this.urls
          .map((u) => {
            try {
              return new URL(u).pathname.replace(/\/$/, "");
            } catch {
              return null;
            }
          })
          .filter(Boolean)
      );
      console.log(
        `📋 Loaded ${this.processed.size} coupons from checkpoint (lastProcessedIndex=${this.lastProcessedIndex})`
      );
    } else {
      console.log("📋 No existing checkpoint found, starting fresh");
    }
  }

  save() {
    // Preserve lastProcessedIndex
    writeJson(FILES.CHECKPOINT, {
      lastProcessedIndex: this.lastProcessedIndex,
      processed: [...this.urls],
    });
  }

  setLastProcessedIndex(i) {
    if (typeof i === "number" && i >= -1) {
      this.lastProcessedIndex = i;
      this.save();
    }
  }

  getLastProcessedIndex() {
    return this.lastProcessedIndex;
  }

  checkAndAdd(finalUrl) {
    const parsed = (() => {
      if (!finalUrl) return null;
      try {
        const u = new URL(finalUrl);
        return {
          path: u.pathname.replace(/\/$/, ""),
          coupon: u.searchParams.get("couponCode") || null,
        };
      } catch {
        return null;
      }
    })();

    if (!parsed) {
      console.log("❌ Invalid or non-Udemy coupon link");
      return false;
    } else if (this.urls.includes(finalUrl)) {
      console.log(`${parsed.coupon} ➡ ➿ EXISTS`);
      return false;
    } else if (parsed.coupon && this.processed.has(parsed.path)) {
      console.log(`${parsed.path} ➡ 🈵 EXISTS`);
      return false;
    }

    this.processed.add(parsed.path);
    this.urls.push(finalUrl);
    console.log(`🈚 ➡ COUPON: ${parsed.coupon}`);
    this.save();
    return true;
  }
}

module.exports = { Checkpoint };
