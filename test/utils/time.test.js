const { sleep } = require('../../src/utils/time');

describe('sleep', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  test('resolves after the requested delay', async () => {
    jest.useFakeTimers();
    const promise = sleep(250);
    let resolved = false;
    promise.then(() => { resolved = true; });

    jest.advanceTimersByTime(249);
    await Promise.resolve();
    expect(resolved).toBe(false);

    jest.advanceTimersByTime(1);
    await promise;
    expect(resolved).toBe(true);
  });
});