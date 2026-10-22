const { createRideService } = require('../RideService');

describe('RideService.listRides', () => {
  const build = (rows = []) => {
    const findMany = jest.fn().mockResolvedValue(rows);
    return { findMany, rides: createRideService({ prisma: { ride: { findMany } } }) };
  };

  test('hides finished rides under 100 m and deleted rides, for this user only', async () => {
    const { findMany, rides } = build();
    await rides.listRides('u1', {});
    const { where } = findMany.mock.calls[0][0];
    expect(where.userId).toBe('u1');
    expect(where.status).toEqual({ not: 'DELETED' });
    // matches "finalized AND under 100 m", which is excluded; unfinished rides are unaffected
    expect(where.NOT).toEqual({ status: 'FINALIZED', distanceM: { lt: 100 } });
  });

  test('pages with a cursor and reports the next one', async () => {
    const rows = Array.from({ length: 3 }, (_, i) => ({ id: `r${i}` }));
    const { findMany, rides } = build(rows);
    const page = await rides.listRides('u1', { limit: 2, cursor: 'r9' });
    expect(findMany.mock.calls[0][0]).toMatchObject({ take: 3, cursor: { id: 'r9' }, skip: 1 });
    expect(page.items).toHaveLength(2);
    expect(page.nextCursor).toBe('r1');
  });
});
