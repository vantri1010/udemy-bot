const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getCourseLanguageValue,
  isSupportedCourseLanguage,
} = require('../src/udemy/priceCheck');

test('extracts supported language labels from course markup', () => {
  const html = `
    <div class="course-lede-module-scss-module__D37FTG__last-updated-languages-container">
      <div class="course-language-module-scss-module__OQCKeq__course-languages ud-text-sm" data-purpose="course-language">
        <svg aria-label="Course Language" role="img"></svg>
        <span>English</span>
      </div>
    </div>
  `;

  assert.equal(getCourseLanguageValue(html), 'English');
  assert.equal(isSupportedCourseLanguage(html), true);
});

test('accepts Vietnamese and rejects unsupported languages', () => {
  const vietnameseHtml = `
    <div class="course-language-module-scss-module__OQCKeq__course-languages" data-purpose="course-language">
      <span>Vietnamese</span>
    </div>
  `;

  const unsupportedHtml = `
    <div class="course-language-module-scss-module__OQCKeq__course-languages" data-purpose="course-language">
      <span>Japanese</span>
    </div>
  `;

  assert.equal(getCourseLanguageValue(vietnameseHtml), 'Vietnamese');
  assert.equal(isSupportedCourseLanguage(vietnameseHtml), true);
  assert.equal(isSupportedCourseLanguage(unsupportedHtml), false);
});
