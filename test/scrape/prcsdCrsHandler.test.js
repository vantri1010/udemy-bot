const fs = require('fs');

const checkpointPath = '/tmp/udemy-bot-checkpoint.test.json';

jest.mock('../../src/config/paths', () => ({
  FILES: { CHECKPOINT: '/tmp/udemy-bot-checkpoint.test.json' },
}));

const { Checkpoint } = require('../../src/scrape/prcsdCrsHandler');

describe('Checkpoint', () => {
  beforeEach(() => {
    fs.rmSync(checkpointPath, { force: true });
  });

  afterAll(() => {
    fs.rmSync(checkpointPath, { force: true });
  });

  test('adds a coupon once and rejects duplicate course paths', () => {
    const checkpoint = new Checkpoint();
    const firstUrl = 'https://www.udemy.com/course/javascript-101/?couponCode=FIRST';
    const secondCoupon = 'https://www.udemy.com/course/javascript-101/?couponCode=SECOND';

    expect(checkpoint.checkAndAdd(firstUrl)).toBe(true);
    expect(checkpoint.checkAndAdd(firstUrl)).toBe(false);
    expect(checkpoint.checkAndAdd(secondCoupon)).toBe(false);
    expect(checkpoint.getUrls()).toEqual([firstUrl]);
  });

  test('persists and reloads processed URLs and resume index', () => {
    const saved = new Checkpoint();
    const courseUrl = 'https://www.udemy.com/course/python-101/?couponCode=SAVE';
    saved.checkAndAdd(courseUrl);
    saved.setLastProcessedIndex(4);

    const loaded = new Checkpoint();
    loaded.load();

    expect(loaded.getUrls()).toEqual([courseUrl]);
    expect(loaded.getLastProcessedIndex()).toBe(4);
    expect(loaded.checkAndAdd(courseUrl)).toBe(false);
  });

  test('ignores invalid links without changing state', () => {
    const checkpoint = new Checkpoint();

    expect(checkpoint.checkAndAdd(null)).toBe(false);
    expect(checkpoint.checkAndAdd('not a URL')).toBe(false);
    expect(checkpoint.getUrls()).toEqual([]);
  });
});