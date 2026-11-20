jest.mock('../Logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

const { JobQueue } = require('../JobQueue');

const flushImmediate = () => new Promise((resolve) => setImmediate(resolve));
const waitUntil = async (predicate) => {
  for (let i = 0; i < 20; i++) {
    if (predicate()) return;
    await flushImmediate();
  }
  throw new Error('condition was not reached');
};

describe('JobQueue concurrency', () => {
  test('reserves capacity before scheduled workers begin', async () => {
    const queue = new JobQueue();
    queue.concurrency = 1;
    let releaseFirst;
    let running = 0;
    let maxRunning = 0;
    const worker = jest.fn()
      .mockImplementationOnce(() => new Promise((resolve) => {
        running++;
        maxRunning = Math.max(maxRunning, running);
        releaseFirst = () => {
          running--;
          resolve('first');
        };
      }))
      .mockImplementationOnce(async () => {
        running++;
        maxRunning = Math.max(maxRunning, running);
        running--;
        return 'second';
      });

    queue.process('test', worker);
    queue.add('test');
    queue.add('test');

    await waitUntil(() => worker.mock.calls.length === 1);
    expect(worker).toHaveBeenCalledTimes(1);
    expect(maxRunning).toBe(1);

    releaseFirst();
    await waitUntil(() => worker.mock.calls.length === 2 && queue.stats.activeJobs === 0);
    expect(worker).toHaveBeenCalledTimes(2);
    expect(maxRunning).toBe(1);
  });
});
