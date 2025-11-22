function normalizeUrl(url) {
  return url.split('?')[0].replace(/\/$/g, '').replace(/\/learn$/g, '');
}

function extractCourseName(url) {
  const match = url.split('/course/')[1]?.split('/')[0];
  return match ? decodeURIComponent(match).replace(/-/g, ' ') : 'unknown';
}

function cleanUdemyLink(href) {
  try {
    const url = new URL(href);
    if (!url.hostname.includes('udemy.com')) return null;
    const coupon = url.searchParams.get('couponCode');
    if (!coupon) return null;
    return `https://www.udemy.com${url.pathname}?couponCode=${coupon}`;
  } catch {
    return null;
  }
}

function extractUdemyFromTrk(trkUrl) {
  try {
    const url = new URL(trkUrl);
    const u = url.searchParams.get('u');
    if (!u) return null;
    const decoded = decodeURIComponent(u);
    return cleanUdemyLink(decoded);
  } catch {
    return null;
  }
}

module.exports = { normalizeUrl, extractCourseName, cleanUdemyLink, extractUdemyFromTrk };
