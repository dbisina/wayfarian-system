jest.mock('../../prisma/client', () => ({}));
jest.mock('multer', () => { const m = () => ({ single: () => () => {} }); m.memoryStorage = () => ({}); return m; });
const { normalizePlate } = require('../../controllers/vehicleController');

describe('normalizePlate', () => {
  test('upper cases, keeps letters, digits, spaces and hyphens, trims and caps at 12', () => {
    expect(normalizePlate('  lnd 482 kj ')).toBe('LND 482 KJ');
    expect(normalizePlate('ab-12  cd')).toBe('AB-12 CD');
    expect(normalizePlate('abc<script>123')).toBe('ABCSCRIPT123');
    expect(normalizePlate('ABCDEFGH1234567')).toBe('ABCDEFGH1234');
  });
  test('empty or non-text input clears the plate', () => {
    expect(normalizePlate('   ')).toBeNull();
    expect(normalizePlate('###')).toBeNull();
    expect(normalizePlate(undefined)).toBeNull();
    expect(normalizePlate(42)).toBeNull();
  });
});
