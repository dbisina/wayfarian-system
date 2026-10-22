const { v1Sunset } = require('../v1Sunset');

const run = (mode, method) => {
  const res = { statusCode: 200, body: null, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } };
  let nexted = false;
  v1Sunset(mode)({ method }, res, () => { nexted = true; });
  return { nexted, res };
};

describe('v1 sunset switch', () => {
  test.each([[undefined], ['off'], ['']])('%p lets everything through', (mode) => {
    for (const m of ['GET', 'POST', 'DELETE']) expect(run(mode, m).nexted).toBe(true);
  });

  test('"writes" keeps reads working and refuses changes with 426', () => {
    expect(run('writes', 'GET').nexted).toBe(true);
    for (const m of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      const { nexted, res } = run('writes', m);
      expect(nexted).toBe(false);
      expect(res.statusCode).toBe(426);
      expect(res.body.error.code).toBe('upgrade_required');
    }
  });

  test('"all" refuses everything', () => {
    const { nexted, res } = run('all', 'GET');
    expect(nexted).toBe(false);
    expect(res.statusCode).toBe(426);
  });

  test('unknown values fail open, never lock people out by typo', () => {
    expect(run('wrietes', 'POST').nexted).toBe(true);
  });
});
