import { describe, it, expect } from 'vitest';
import { marginInfo, formatMargin } from '../lib/adminCosting';

describe('adminCosting - marginInfo', () => {
  it('is unavailable without a cost', () => {
    expect(marginInfo(100, null).available).toBe(false);
    expect(marginInfo(100, undefined).available).toBe(false);
    expect(marginInfo(100, '').available).toBe(false);
    expect(marginInfo(100, 'not-a-number').available).toBe(false);
  });

  it('computes a positive margin and rounds to 1 decimal', () => {
    // (100 - 75) / 100 = 25%
    expect(marginInfo(100, 75)).toEqual({ available: true, percent: 25, negative: false });
    // (500 - 416.666...) / 500 = 16.666...% -> 16.7
    expect(marginInfo(500, 416.67).percent).toBeCloseTo(16.7, 1);
  });

  it('flags a negative margin when cost exceeds price', () => {
    const info = marginInfo(80, 100); // (80 - 100) / 80 = -25%
    expect(info.negative).toBe(true);
    expect(info.percent).toBe(-25);
  });

  it('has no percentage when the product is unpriced', () => {
    expect(marginInfo(0, 50)).toEqual({ available: true, percent: null, negative: false });
    expect(marginInfo('x', 50).percent).toBe(null);
  });
});

describe('adminCosting - formatMargin', () => {
  it('renders an em dash when nothing is meaningful', () => {
    expect(formatMargin(100, null)).toBe('—');
    expect(formatMargin(0, 50)).toBe('—');
  });

  it('renders the rounded percentage', () => {
    expect(formatMargin(200, 150)).toBe('25%');
    expect(formatMargin(80, 100)).toBe('-25%');
  });
});
