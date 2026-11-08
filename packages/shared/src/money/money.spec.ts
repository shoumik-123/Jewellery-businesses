import {
  Decimal,
  InvalidMoneyError,
  currencySymbol,
  add,
  addPercent,
  allocate,
  clampNonNegative,
  divide,
  equals,
  formatMoney,
  formatWeight,
  greaterThan,
  isNegative,
  isPositive,
  isZero,
  lessThan,
  max,
  min,
  money,
  multiply,
  percentOf,
  roundMoney,
  roundWeight,
  subtract,
  sum,
  toMoneyString,
  toWeightString,
} from './money';

describe('money', () => {
  describe('exactness', () => {
    it('does not lose precision the way floats do', () => {
      // The canonical float failure: 0.1 + 0.2 === 0.30000000000000004
      expect(toMoneyString(add('0.10', '0.20'))).toBe('0.30');
      expect(equals(add('0.10', '0.20'), '0.30')).toBe(true);
    });

    it('keeps long decimal chains exact', () => {
      // 1 / 3 * 3 must come back to 1, not 0.9999999...
      expect(toMoneyString(multiply(divide('1', '3'), '3'))).toBe('1.00');
    });

    it('adds a thousand line items without drift', () => {
      const lines = Array.from({ length: 1000 }, () => '0.01');
      expect(toMoneyString(sum(lines))).toBe('10.00');
    });

    it('handles realistic jewellery amounts', () => {
      // 12.500g of 22K at 11,850.00/g
      expect(toMoneyString(multiply('12.500', '11850.00'))).toBe('148125.00');
    });
  });

  describe('rounding', () => {
    it.each([
      ['0.005', '0.01'],
      ['0.004', '0.00'],
      ['0.015', '0.02'],
      ['0.025', '0.03'], // half-up, not banker's rounding (which would give 0.02)
      ['1.005', '1.01'],
      ['2.675', '2.68'], // the classic float case: 2.675.toFixed(2) === '2.67'
      ['1234.567', '1234.57'],
    ])('rounds %s half-up to %s', (input, expected) => {
      expect(toMoneyString(input)).toBe(expected);
    });

    it('rounds negatives away from zero', () => {
      expect(toMoneyString('-0.005')).toBe('-0.01');
    });

    it('rounds weight to 3 decimals', () => {
      expect(toWeightString('12.4565')).toBe('12.457');
      expect(toWeightString('0.0004')).toBe('0.000');
      expect(toWeightString('8')).toBe('8.000');
    });

    it('does not mutate its input', () => {
      const original = money('1.005');
      roundMoney(original);
      expect(original.toString()).toBe('1.005');
    });
  });

  describe('input validation', () => {
    it.each([
      [Number.NaN],
      [Number.POSITIVE_INFINITY],
      [Number.NEGATIVE_INFINITY],
      [''],
      ['   '],
      ['abc'],
      ['12,50'],
    ])('rejects %p rather than producing NaN', (input) => {
      expect(() => money(input as never)).toThrow(InvalidMoneyError);
    });

    it('accepts strings, numbers and Decimals', () => {
      expect(toMoneyString(money('10.50'))).toBe('10.50');
      expect(toMoneyString(money(10.5))).toBe('10.50');
      expect(toMoneyString(money(money('10.50')))).toBe('10.50');
    });

    it('refuses division by zero instead of returning Infinity', () => {
      expect(() => divide('10', '0')).toThrow(InvalidMoneyError);
    });
  });

  describe('arithmetic', () => {
    it('adds, subtracts, multiplies, divides', () => {
      expect(toMoneyString(add('1.10', '2.20', '3.30'))).toBe('6.60');
      expect(toMoneyString(subtract('10.00', '3.33'))).toBe('6.67');
      expect(toMoneyString(multiply('3', '4.50'))).toBe('13.50');
      expect(toMoneyString(divide('10.00', '4'))).toBe('2.50');
    });

    it('sums an empty list to zero, not NaN', () => {
      expect(toMoneyString(sum([]))).toBe('0.00');
    });

    it('computes percentages as percentages', () => {
      expect(toMoneyString(percentOf('1000.00', '8'))).toBe('80.00');
      expect(toMoneyString(percentOf('1000.00', '8.5'))).toBe('85.00');
      expect(toMoneyString(addPercent('1000.00', '8'))).toBe('1080.00');
      expect(toMoneyString(percentOf('0', '15'))).toBe('0.00');
    });

    it('clamps negatives, for a discount larger than the subtotal', () => {
      expect(toMoneyString(clampNonNegative(subtract('100.00', '150.00')))).toBe('0.00');
      expect(toMoneyString(clampNonNegative('50.00'))).toBe('50.00');
    });

    it('compares', () => {
      expect(greaterThan('10.01', '10.00')).toBe(true);
      expect(lessThan('9.99', '10.00')).toBe(true);
      expect(equals('10.00', '10.000')).toBe(true);
      expect(isZero('0.00')).toBe(true);
      expect(isPositive('0.01')).toBe(true);
      expect(isNegative('-0.01')).toBe(true);
      expect(toMoneyString(min('3.00', '2.00'))).toBe('2.00');
      expect(toMoneyString(max('3.00', '2.00'))).toBe('3.00');
    });
  });

  describe('allocate', () => {
    it('splits so the parts sum exactly to the total', () => {
      // 10.00 across three equal lines cannot divide evenly
      const parts = allocate('10.00', ['1', '1', '1']);
      // The rounding remainder lands on the first of the equal-largest parts.
      expect(parts.map((p) => p.toFixed(2))).toEqual(['3.34', '3.33', '3.33']);
      expect(toMoneyString(sum(parts))).toBe('10.00');
    });

    it('weights by line value', () => {
      const parts = allocate('100.00', ['3000.00', '1000.00']);
      expect(parts.map((p) => p.toFixed(2))).toEqual(['75.00', '25.00']);
      expect(toMoneyString(sum(parts))).toBe('100.00');
    });

    it.each([
      ['0.01', ['1', '1', '1']],
      ['999.99', ['7', '11', '13', '17']],
      ['1.00', ['1', '2', '3', '4', '5', '6', '7']],
    ])('never invents or loses money for %s', (total, weights) => {
      expect(toMoneyString(sum(allocate(total, weights)))).toBe(toMoneyString(total));
    });

    it('gives everything to the first part when all weights are zero', () => {
      const parts = allocate('10.00', ['0', '0']);
      expect(parts.map((p) => p.toFixed(2))).toEqual(['10.00', '0.00']);
    });
  });

  describe('formatting', () => {
    it('groups BDT in the lakh system, other currencies in thousands', () => {
      expect(formatMoney('148125.00')).toBe('Tk 1,48,125.00');
      expect(formatMoney('12345678.00')).toBe('Tk 1,23,45,678.00');
      expect(formatMoney('1250.5', { symbol: '৳' })).toBe('৳ 1,250.50');
      expect(formatMoney('148125.00', { currency: 'USD' })).toBe('$ 148,125.00');
      expect(formatMoney('148125.00', { grouping: 'western', symbol: 'Tk' })).toBe('Tk 148,125.00');
    });

    it('keeps the sign in front of the digits, not the symbol', () => {
      expect(formatMoney('-1500.00')).toBe('Tk -1,500.00');
    });

    it('can drop decimals on whole amounts for dense tables', () => {
      expect(formatMoney('5000', { compactDecimals: true })).toBe('Tk 5,000');
      expect(formatMoney('5000.25', { compactDecimals: true })).toBe('Tk 5,000.25');
    });

    it('formats weights with the unit', () => {
      expect(formatWeight('12.5')).toBe('12.500 g');
      expect(formatWeight('1.25', 'ct')).toBe('1.250 ct');
    });

    it('displays exactly what is stored', () => {
      // A float path would render 2.67 here.
      expect(formatMoney('2.675', { symbol: '' }).trim()).toBe('2.68');
    });
  });

  it('rounds weight half-up at the boundary', () => {
    expect(roundWeight('0.0005').toFixed(3)).toBe('0.001');
  });

  describe('currency symbols', () => {
    it('falls back to the uppercased code for a currency we have no symbol for', () => {
      expect(currencySymbol('jpy')).toBe('JPY');
      expect(formatMoney('1000', { currency: 'jpy' })).toBe('JPY 1,000.00');
    });

    it('knows the currencies we actually sell in', () => {
      expect(currencySymbol('BDT')).toBe('Tk');
      expect(currencySymbol('usd')).toBe('$');
      expect(currencySymbol('INR')).toBe('₹');
    });
  });

  describe('edge cases that have bitten real systems', () => {
    it('rejects a non-finite Decimal', () => {
      expect(() => money(new Decimal(Number.POSITIVE_INFINITY))).toThrow(InvalidMoneyError);
    });

    it('allocates a single part as the whole amount', () => {
      expect(allocate('99.99', ['1']).map((p) => p.toFixed(2))).toEqual(['99.99']);
    });

    it('allocates to an empty list without throwing', () => {
      expect(allocate('10.00', [])).toEqual([]);
    });

    it('formats with no symbol when one is explicitly empty', () => {
      expect(formatMoney('1234.5', { symbol: '' })).toBe('1,234.50');
    });

    it('treats a bare 3-digit amount as ungrouped', () => {
      expect(formatMoney('999', { symbol: '' })).toBe('999.00');
    });
  });
});
