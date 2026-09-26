/**
 * Resolve a Udemy tracking URL (affiliate / impact.com redirect) to a clean
 * Udemy course URL that includes the coupon code.
 *
 * @param {string} courseLink - The raw tracking URL (href attribute value)
 * @returns {Promise<string>} - Clean Udemy URL with couponCode, e.g.
 *   "https://www.udemy.com/course/2117722/?couponCode=B921552D86249EC14104"
 */
async function resolveTrackingUrl(courseLink) {
  try {
    const trackingUrl = new URL(courseLink);

    // 1. Lấy URL đích từ tham số "u" (URL-encoded)
    const rawTarget = trackingUrl.searchParams.get('u');
    if (!rawTarget) {
      // Nếu không có tham số "u", có thể đây không phải tracking link của Udemy
      // hoặc link đã là URL Udemy trực tiếp
      return courseLink;
    }

    const targetUrl = decodeURIComponent(rawTarget);

    // 2. Parse URL đích để lấy course slug và couponCode
    const parsedTarget = new URL(targetUrl);

    // Đảm bảo đúng domain Udemy
    if (!/udemy\.com$/i.test(parsedTarget.hostname) &&
        !/\.udemy\.com$/i.test(parsedTarget.hostname)) {
      return targetUrl;
    }

    // 3. Lấy couponCode từ URL đích (ưu tiên) hoặc từ tracking URL
    let couponCode = parsedTarget.searchParams.get('couponCode');
    if (!couponCode) {
      // Fallback: một số tracking link để couponCode ở query gốc
      couponCode = trackingUrl.searchParams.get('couponCode');
    }

    // 4. Trích xuất course ID / slug từ pathname
    //    Ví dụ: /course/2117722/  ->  "2117722"
    const courseMatch = parsedTarget.pathname.match(/^\/course\/([^/]+)/i);
    const courseSlug = courseMatch ? courseMatch[1] : null;

    if (!courseSlug) {
      // Không nhận diện được course -> trả về URL gốc đã decode
      return targetUrl;
    }

    // 5. Tạo URL Udemy sạch
    let cleanUrl = `https://www.udemy.com/course/${courseSlug}/`;
    if (couponCode) {
      cleanUrl += `?couponCode=${encodeURIComponent(couponCode)}`;
    }

    return cleanUrl;
  } catch (err) {
    // Nếu URL không hợp lệ, trả về nguyên bản để tránh crash
    console.error('resolveTrackingUrl error:', err);
    return courseLink;
  }
}

module.exports = { resolveTrackingUrl };