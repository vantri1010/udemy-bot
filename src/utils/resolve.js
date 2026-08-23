async function resolveTrackingUrl(browser, url) {
  if (url.includes('udemy.com') && url.includes('couponCode=')) return url;
  const page = await browser.newPage();
  try {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    } catch (_) {}

    try {
      await page.waitForSelector('a.rd-btn', { timeout: 10000 });
      const courseLink = await page.$('a.rd-btn');
      const hrefProp = courseLink ? await courseLink.getProperty('href') : null;
      const courseUrl = hrefProp ? await hrefProp.jsonValue() : null;
      if (courseUrl?.includes('udemy.com') && courseUrl.includes('couponCode=')) {
        return courseUrl;
      }
    } catch (_) {}

    const finalUrl = page.url();
    return finalUrl.includes('udemy.com') && finalUrl.includes('couponCode=') ? finalUrl : null;
  } catch {
    return null;
  } finally {
    await page.close();
  }
}

module.exports = { resolveTrackingUrl };
