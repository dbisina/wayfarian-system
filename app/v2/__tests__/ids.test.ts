import { describe, expect, test } from 'vitest';
import { detailRouteFor, legacyJourneyIdOf } from '../ids';

describe('ride ids from the old system', () => {
  test('a carried-over solo journey maps back to its old id', () => {
    expect(legacyJourneyIdOf('lj_cmlgq9cc8abc')).toBe('cmlgq9cc8abc');
    expect(legacyJourneyIdOf('li_cmlgq9cc8abc')).toBeNull(); // group instance, no journey screen for it
    expect(legacyJourneyIdOf('2f0d7a52-9d0b-4a26-8d49-3f7e8b1c0a11')).toBeNull();
    expect(legacyJourneyIdOf(undefined)).toBeNull();
  });

  test('lists open old journeys on the full journey screen and new rides on the ride screen', () => {
    expect(detailRouteFor('lj_abc123')).toEqual({ pathname: '/journey-detail', params: { journeyId: 'abc123' } });
    expect(detailRouteFor('li_abc123')).toEqual({ pathname: '/ride-detail', params: { rideId: 'li_abc123' } });
    expect(detailRouteFor('new-ride-uuid-1')).toEqual({ pathname: '/ride-detail', params: { rideId: 'new-ride-uuid-1' } });
  });
});
