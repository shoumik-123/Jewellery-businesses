import {
  GOLD_PURITIES,
  PURITIES_BY_METAL,
  RING_SIZES,
  convertPurityWeight,
  findPurity,
  findRingSize,
  fromGrams,
  toGrams,
} from './jewellery';

describe('jewellery reference data', () => {
  describe('purity', () => {
    it('knows the purities a Bangladeshi jeweller actually stocks', () => {
      expect(findPurity('22K')?.fineness).toBe(916);
      expect(findPurity('21k')?.fineness).toBe(875);
      expect(findPurity('18K')?.fineness).toBe(750);
      expect(findPurity('925')?.fineness).toBe(925);
    });

    it('returns undefined for an unknown code rather than guessing', () => {
      expect(findPurity('23K')).toBeUndefined();
    });

    it('keeps fineness and purity consistent', () => {
      for (const p of GOLD_PURITIES) {
        expect(p.purity).toBeCloseTo(p.fineness / 1000, 3);
      }
    });

    it('offers no purity options for plated and non-precious metals', () => {
      expect(PURITIES_BY_METAL.GOLD_PLATED).toHaveLength(0);
      expect(PURITIES_BY_METAL.ALLOY).toHaveLength(0);
      expect(PURITIES_BY_METAL.NONE).toHaveLength(0);
      expect(PURITIES_BY_METAL.GOLD.length).toBeGreaterThan(0);
    });

    it('converts weight between purities', () => {
      // 10g of 22K (916) is 9.169g of pure-gold equivalent at 999
      expect(convertPurityWeight('10', '22K', '24K').toFixed(3)).toBe('9.169');
      // and the reverse
      expect(convertPurityWeight('9.169', '24K', '22K').toFixed(3)).toBe('10.000');
    });

    it('is identity when the purities match', () => {
      expect(convertPurityWeight('12.345', '22K', '22K').toFixed(3)).toBe('12.345');
    });

    it('throws on an unknown purity instead of silently mispricing', () => {
      expect(() => convertPurityWeight('10', '23K', '22K')).toThrow(/Unknown purity: 23K/);
      expect(() => convertPurityWeight('10', '22K', 'XYZ')).toThrow(/Unknown purity: XYZ/);
    });
  });

  describe('weight units', () => {
    it('converts the traditional units customers still use', () => {
      // 1 bhori (tola) = 11.664 g — the unit gold is quoted in locally
      expect(toGrams('1', 'bhori').toFixed(3)).toBe('11.664');
      expect(toGrams('2.5', 'bhori').toFixed(3)).toBe('29.160');
      expect(toGrams('1', 'ana').toFixed(3)).toBe('0.729');
      expect(toGrams('1', 'ratti').toFixed(3)).toBe('0.180');
      expect(toGrams('1', 'ct').toFixed(3)).toBe('0.200');
      expect(toGrams('500', 'mg').toFixed(3)).toBe('0.500');
    });

    it('keeps 16 ana to the bhori', () => {
      const bhoriInGrams = toGrams('1', 'bhori');
      const sixteenAna = toGrams('16', 'ana');
      // 16 x 0.729 = 11.664
      expect(sixteenAna.toFixed(3)).toBe(bhoriInGrams.toFixed(3));
    });

    it('round-trips grams back to the source unit', () => {
      expect(fromGrams(toGrams('3', 'bhori'), 'bhori').toFixed(2)).toBe('3.00');
      expect(fromGrams('11.664', 'bhori').toFixed(2)).toBe('1.00');
    });

    it('rejects an unknown unit', () => {
      // @ts-expect-error — deliberately passing an invalid unit
      expect(() => toGrams('1', 'stone')).toThrow(/Unknown weight unit/);
      // @ts-expect-error — deliberately passing an invalid unit
      expect(() => fromGrams('1', 'stone')).toThrow(/Unknown weight unit/);
    });
  });

  describe('ring sizes', () => {
    it('maps the Indian/Bangladeshi size standard', () => {
      expect(findRingSize(16)?.us).toBe(8);
      expect(findRingSize(12)?.uk).toBe('L');
      expect(findRingSize(99)).toBeUndefined();
    });

    it('increases monotonically in circumference', () => {
      for (let i = 1; i < RING_SIZES.length; i += 1) {
        expect(RING_SIZES[i]!.circumferenceMm).toBeGreaterThan(RING_SIZES[i - 1]!.circumferenceMm);
        expect(RING_SIZES[i]!.indian).toBe(RING_SIZES[i - 1]!.indian + 1);
      }
    });

    it('keeps circumference and diameter consistent', () => {
      for (const size of RING_SIZES) {
        expect(size.circumferenceMm / Math.PI).toBeCloseTo(size.diameterMm, 0);
      }
    });
  });
});
