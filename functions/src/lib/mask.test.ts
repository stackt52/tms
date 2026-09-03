import { describe, expect, it } from 'vitest';
import { maskDigits, maskPayout } from './mask';

describe('maskDigits', () => {
  it('keeps only the trailing digits', () => {
    expect(maskDigits('0977123882', 3)).toBe('···882');
    expect(maskDigits('0110 0044 1524 4415', 4)).toBe('···4415');
    expect(maskDigits('+260 97 712 3456', 3)).toBe('···456');
  });
  it('is idempotent on already-masked values', () => {
    expect(maskDigits('···882', 3)).toBe('···882');
    expect(maskDigits('···4415', 4)).toBe('···4415');
    expect(maskDigits('****4415', 4)).toBe('···4415');
  });
  it('handles empty input', () => {
    expect(maskDigits('', 3)).toBe('');
    expect(maskDigits(undefined, 3)).toBe('');
  });
});

describe('maskPayout', () => {
  it('masks mobile money to 3 and bank to 4 digits', () => {
    expect(maskPayout({ type: 'MOBILE_MONEY', provider: 'AIRTEL', numberMasked: '0977123882' })).toEqual({ type: 'MOBILE_MONEY', provider: 'AIRTEL', numberMasked: '···882' });
    expect(maskPayout({ type: 'BANK', bankName: 'Zanaco', accountMasked: '5010004415' })).toEqual({ type: 'BANK', bankName: 'Zanaco', accountMasked: '···4415' });
    expect(maskPayout(null)).toBeNull();
  });
});
