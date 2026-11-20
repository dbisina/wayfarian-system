jest.mock('ioredis', () => jest.fn().mockImplementation(() => ({
  on: jest.fn(),
  // Keep singleton initialization suspended so the test never opens Redis or timers.
  subscribe: jest.fn(() => new Promise(() => {})),
})));

jest.mock('../Logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

const logger = require('../Logger');
const { ValkeyJobQueue } = require('../ValkeyJobQueue');

const flushImmediate = () => new Promise((resolve) => setImmediate(resolve));

describe('ValkeyJobQueue concurrency', () => {
  test('reserves capacity before a claimed job starts and handles executor rejection', async () => {
    const queue = Object.create(ValkeyJobQueue.prototype);
    Object.assign(queue, {
      isProcessing: false,
      client: {},
      activeJobs: new Set(),
      pendingExecutions: 0,
      concurrency: 1,
      getNextJob: jest.fn().mockResolvedValueOnce({ id: 'one' }).mockResolvedValueOnce({ id: 'two' }),
      hasWaitingJobs: jest.fn().mockResolvedValue(false),
      executeJob: jest.fn().mockRejectedValue(new Error('unexpected')),
    });

    await queue.processJobs();

    expect(queue.getNextJob).toHaveBeenCalledTimes(1);
    expect(queue.pendingExecutions).toBe(1);

    await flushImmediate();
    await Promise.resolve();
    expect(queue.pendingExecutions).toBe(0);
    expect(queue.executeJob).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith(
      'Unexpected Valkey job execution error',
      expect.objectContaining({ jobId: 'one', error: 'unexpected' })
    );
  });
});
