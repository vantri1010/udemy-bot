const {
  normalizeUrl,
  extractCourseName,
  cleanUdemyLink,
  extractUdemyFromTrk,
} = require('../../src/utils/url');

describe('URL utilities', () => {
  test('normalizes query strings, trailing slashes, and learn URLs', () => {
    expect(normalizeUrl('https://www.udemy.com/course/node-js/?couponCode=SAVE#/learn'))
      .toBe('https://www.udemy.com/course/node-js');
  });

  test('extracts and decodes a course name', () => {
    expect(extractCourseName('https://www.udemy.com/course/%C3%A9tude-javascript/'))
      .toBe('étude javascript');
    expect(extractCourseName('https://www.udemy.com/topic/javascript/')).toBe('unknown');
  });

  test('keeps only Udemy coupon links and removes unrelated query parameters', () => {
    expect(cleanUdemyLink(
      'https://www.udemy.com/course/node-js/?couponCode=SAVE&utm_source=test'
    )).toBe('https://www.udemy.com/course/node-js/?couponCode=SAVE');
    expect(cleanUdemyLink('https://example.com/course/node-js/?couponCode=SAVE')).toBeNull();
    expect(cleanUdemyLink('not a URL')).toBeNull();
    expect(cleanUdemyLink('https://www.udemy.com/course/node-js/')).toBeNull();
  });

  test('extracts a coupon link from a tracking URL', () => {
    const courseUrl = 'https://www.udemy.com/course/node-js/?couponCode=SAVE';
    const trackingUrl = `https://trk.udemy.com/click?u=${encodeURIComponent(courseUrl)}`;

    expect(extractUdemyFromTrk(trackingUrl)).toBe(courseUrl);
    expect(extractUdemyFromTrk('https://trk.udemy.com/click')).toBeNull();
  });
});