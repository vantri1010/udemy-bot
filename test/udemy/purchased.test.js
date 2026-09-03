jest.mock('../../src/config/paths', () => ({
  FILES: { UDEMY_PURCHASED: '/tmp/udemy-bot-purchased.test.json' },
}));

jest.mock('../../src/utils/fsUtils', () => ({
  readJson: jest.fn(),
  writeJson: jest.fn(),
}));

jest.mock('../../src/utils/time', () => ({
  sleep: jest.fn().mockResolvedValue(undefined),
}));

const { readJson, writeJson } = require('../../src/utils/fsUtils');
const { sleep } = require('../../src/utils/time');
const { fetchPurchasedCourses } = require('../../src/udemy/purchased');

function course(id, slug, instructor) {
  return {
    id,
    title: `Course ${id}`,
    url: `/course/${slug}/learn/`,
    visible_instructors: [{ title: instructor }],
  };
}

function createBrowser(pageResponses) {
  const page = {
    goto: jest.fn().mockResolvedValue(undefined),
    evaluate: jest.fn().mockImplementation(() => Promise.resolve(pageResponses.shift())),
    close: jest.fn().mockResolvedValue(undefined),
  };
  return { browser: { newPage: jest.fn().mockResolvedValue(page) }, page };
}

describe('fetchPurchasedCourses', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    readJson.mockReturnValue(null);
  });

  test('fetches all pages and persists normalized course records', async () => {
    const { browser, page } = createBrowser([
      { ok: true, status: 200, body: { results: [course(1, 'node-js', 'Ada'), course(2, 'python', 'Lin') ] } },
      { ok: true, status: 200, body: { results: [course(3, 'testing', 'Grace') ] } },
    ]);

    const result = await fetchPurchasedCourses(browser, {
      PAGE_SIZE: 2,
      BASE_DELAY: 0,
    });

    expect(result).toEqual([
      { id: 1, title: 'Course 1', url: 'https://www.udemy.com/course/node-js', instructors: ['Ada'] },
      { id: 2, title: 'Course 2', url: 'https://www.udemy.com/course/python', instructors: ['Lin'] },
      { id: 3, title: 'Course 3', url: 'https://www.udemy.com/course/testing', instructors: ['Grace'] },
    ]);
    expect(page.evaluate).toHaveBeenCalledTimes(2);
    expect(writeJson).toHaveBeenLastCalledWith(
      '/tmp/udemy-bot-purchased.test.json',
      expect.objectContaining({ lastFetchedPage: 2, purchdLinks: result })
    );
    expect(page.close).toHaveBeenCalledTimes(1);
    expect(sleep).toHaveBeenCalledWith(400);
  });

  test('retries a failed API request and then succeeds', async () => {
    const { browser, page } = createBrowser([
      { networkError: 'temporary network failure' },
      { ok: true, status: 200, body: { results: [] } },
    ]);

    const result = await fetchPurchasedCourses(browser, {
      MAX_RETRIES: 2,
      BASE_DELAY: 0,
      PAGE_SIZE: 100,
    });

    expect(result).toEqual([]);
    expect(page.evaluate).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(sleep.mock.calls[0][0]).toBeGreaterThanOrEqual(0);
  });
});