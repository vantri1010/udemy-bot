async function resolveTrackingUrl(browser, url) {
  if (url.includes('udemy.com') && url.includes('couponCode=')) return url;
  const page = await browser.newPage();
  try {
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
    const final = page.url();
    return final.includes('udemy.com') && final.includes('couponCode=') ? final : null;
  } catch {
    return null;
  } finally {
    await page.close();
  }
}

module.exports = { resolveTrackingUrl };
