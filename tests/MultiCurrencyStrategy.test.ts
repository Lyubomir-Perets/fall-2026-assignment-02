import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MultiCurrencyStrategy } from '../src/strategies/MultiCurrencyStrategy.js';
import { ExchangeRateService } from '../src/services/ExchangeRateService.js';
import { Transaction } from '../src/models.js';

describe('MultiCurrencyStrategy (Feature 5)', () => {
  let strategy: MultiCurrencyStrategy;

  beforeEach(() => {
    strategy = new MultiCurrencyStrategy();
    vi.restoreAllMocks();
  });

  // Example of how to write and mock in your tests:
  //
  // it('should convert amounts and sum values in target currency', async () => {
  //   const mockRates = { base: 'USD', rates: { EUR: 0.90 } };
  //   const spy = vi.spyOn(ExchangeRateService, 'getExchangeRates').mockResolvedValue(mockRates);
  //
  //   const testTransactions: Transaction[] = [
  //     { id: '1', date: '2026-05-01', amount: 100.00, category: 'Salary', description: 'Gig', status: 'completed' },
  //     { id: '2', date: '2026-05-02', amount: -50.00, category: 'Food', description: 'Grocery', status: 'completed' },
  //   ];
  //
  //   const result = await strategy.execute(testTransactions, 'EUR');
  //
  //   expect(spy).toHaveBeenCalled();
  //   expect(result).toContain('90.00 EUR'); // 100 * 0.90
  //   expect(result).toContain('-45.00 EUR'); // -50 * 0.90
  //   expect(result).toContain('Balance: 45.00 EUR');
  // });

  // tests written courtesy of Claude
/** Build a Transaction with sane defaults so tests only state what matters. */
  function tx(overrides: Partial<Transaction> & { amount: number }): Transaction {
    return {
      id: 'tx-1',
      date: '2026-05-01',
      category: 'General',
      description: 'Test transaction',
      status: 'completed',
      ...overrides,
    };
  }

  /** Mock the rate service and return the spy. */
  function mockRates(rates: Record<string, number>) {
    const payload: ExchangeRates = { base: 'USD', rates };
    return vi
      .spyOn(ExchangeRateService, 'getExchangeRates')
      .mockResolvedValue(payload);
  }

  /** Pull the numeric value off a `Label: <value>` report line. */
  function lineValue(report: string, label: string): string {
    const line = report
      .split('\n')
      .find((l) => l.startsWith(`${label}:`));
    if (line === undefined) {
      throw new Error(`Report has no line labelled "${label}".\n---\n${report}`);
    }
    return line.slice(label.length + 1).trim();
  }

  describe('MultiCurrencyStrategy (Feature 5)', () => {
    let strategy: MultiCurrencyStrategy;

    beforeEach(() => {
      strategy = new MultiCurrencyStrategy();
      vi.restoreAllMocks();
    });

    describe('metadata', () => {
      it('exposes the strategy name and description', () => {
        expect(strategy.name).toBe('Multi-Currency Auditor');
        expect(strategy.description).toBe(
          'Converts and aggregates transactions in a foreign currency',
        );
      });
    });

    describe('exchange rate retrieval', () => {
      it('should parse exchange rates and use customParam target currency', async () => {
        const spy = mockRates({ EUR: 0.92, GBP: 0.79, JPY: 155.4 });

        const report = await strategy.execute([tx({ amount: 100 })], 'GBP');

        expect(spy).toHaveBeenCalledTimes(1);
        expect(report).toContain('Target Currency: GBP');
        expect(report).toContain('Exchange Rate (USD to GBP): 0.79');
        expect(report).not.toContain('Target Currency: EUR');
      });

      it('awaits the service rather than reading it synchronously', async () => {
        let resolved = false;
        vi.spyOn(ExchangeRateService, 'getExchangeRates').mockImplementation(
          () =>
            new Promise<ExchangeRates>((resolve) =>
              setTimeout(() => {
                resolved = true;
                resolve({ base: 'USD', rates: { EUR: 0.9 } });
              }, 10),
            ),
        );

        const report = await strategy.execute([tx({ amount: 100 })]);

        expect(resolved).toBe(true);
        expect(report).toContain('Total Income (EUR): 90.00');
      });

      it('propagates a rejection from the exchange rate service', async () => {
        vi.spyOn(ExchangeRateService, 'getExchangeRates').mockRejectedValue(
          new Error('rate feed unavailable'),
        );

        await expect(strategy.execute([tx({ amount: 100 })])).rejects.toThrow(
          'rate feed unavailable',
        );
      });
    });

    describe('target currency selection', () => {
      it('should default to EUR conversion if currency param is missing or invalid', async () => {
        mockRates({ EUR: 0.9, GBP: 0.5 });

        const missing = await strategy.execute([tx({ amount: 100 })]);
        const unknown = await strategy.execute([tx({ amount: 100 })], 'XYZ');
        const blank = await strategy.execute([tx({ amount: 100 })], '');

        for (const report of [missing, unknown, blank]) {
          expect(report).toContain('Target Currency: EUR');
          expect(report).toContain('Exchange Rate (USD to EUR): 0.9');
          expect(report).toContain('Total Income (EUR): 90.00');
        }
      });

      it('normalises a lower/mixed case currency param to upper case', async () => {
        mockRates({ EUR: 0.9, GBP: 0.5 });

        const lower = await strategy.execute([tx({ amount: 100 })], 'gbp');
        const mixed = await strategy.execute([tx({ amount: 100 })], 'gBp');

        expect(lower).toContain('Target Currency: GBP');
        expect(lower).toContain('Total Income (GBP): 50.00');
        expect(mixed).toContain('Target Currency: GBP');
      });

      it('should throw an error if the target currency does not exist in exchange rates', async () => {
        // No EUR in the feed, so the default fallback has nothing to resolve to.
        mockRates({ GBP: 0.79, JPY: 155.4 });

        await expect(strategy.execute([tx({ amount: 100 })])).rejects.toThrow(
          'Exchange rate for EUR not found.',
        );
        // An unrecognised param falls back to EUR and therefore fails the same way.
        await expect(
          strategy.execute([tx({ amount: 100 })], 'CHF'),
        ).rejects.toThrow('Exchange rate for EUR not found.');
      });

      it('throws when the rate feed is completely empty', async () => {
        mockRates({});

        await expect(
          strategy.execute([tx({ amount: 100 })], 'EUR'),
        ).rejects.toThrow('Exchange rate for EUR not found.');
      });
    });

    describe('calculation correctness — normal case', () => {
      const transactions: Transaction[] = [
        tx({ id: '1', amount: 1000, category: 'Salary', description: 'Payroll' }),
        tx({ id: '2', amount: -400, category: 'Rent', description: 'Rent' }),
        tx({ id: '3', amount: 250, category: 'Freelance', description: 'Gig' }),
        tx({ id: '4', amount: -100, category: 'Food', description: 'Grocery' }),
      ];

      it('should calculate and display totals (income, expense, net balance) in both USD and target currency', async () => {
        // rate 0.5 keeps every product exactly representable in floating point.
        mockRates({ GBP: 0.5, EUR: 0.9 });

        const report = await strategy.execute(transactions, 'GBP');

        // USD side: income 1250, expenses -500, net 750, average 187.50
        expect(lineValue(report, 'Total Income (USD)')).toBe('1250.00');
        expect(lineValue(report, 'Total Expenses (USD)')).toBe('-500.00');
        expect(lineValue(report, 'Net Balance (USD)')).toBe('750.00');
        expect(lineValue(report, 'Average Transaction (USD)')).toBe('187.50');

        // GBP side: every USD figure scaled by 0.5
        expect(lineValue(report, 'Total Income (GBP)')).toBe('625.00');
        expect(lineValue(report, 'Total Expenses (GBP)')).toBe('-250.00');
        expect(lineValue(report, 'Net Balance (GBP)')).toBe('375.00');
        expect(lineValue(report, 'Average Transaction (GBP)')).toBe('93.75');
      });

      it('keeps net balance equal to income plus expenses in both currencies', async () => {
        mockRates({ EUR: 0.9 });

        const report = await strategy.execute(transactions);

        const num = (label: string) => Number(lineValue(report, label));
        expect(num('Net Balance (USD)')).toBeCloseTo(
          num('Total Income (USD)') + num('Total Expenses (USD)'),
          2,
        );
        expect(num('Net Balance (EUR)')).toBeCloseTo(
          num('Total Income (EUR)') + num('Total Expenses (EUR)'),
          2,
        );
      });

      it('scales every figure by the rate for a large-magnitude currency', async () => {
        mockRates({ JPY: 155.4, EUR: 0.9 });

        const report = await strategy.execute(
          [tx({ id: '1', amount: 100 }), tx({ id: '2', amount: -20 })],
          'JPY',
        );

        expect(lineValue(report, 'Exchange Rate (USD to JPY)')).toBe('155.4');
        expect(lineValue(report, 'Total Income (JPY)')).toBe('15540.00'); // 100 * 155.4
        expect(lineValue(report, 'Total Expenses (JPY)')).toBe('-3108.00'); // -20 * 155.4
        expect(lineValue(report, 'Net Balance (JPY)')).toBe('12432.00');
        expect(lineValue(report, 'Average Transaction (JPY)')).toBe('6216.00'); // 40 * 155.4
      });

      it('rounds fractional cents to two decimal places', async () => {
        mockRates({ EUR: 0.9 });

        const report = await strategy.execute([
          tx({ id: '1', amount: 10.005 }),
          tx({ id: '2', amount: -0.014 }),
        ]);

        expect(lineValue(report, 'Total Income (USD)')).toBe('10.01');
        expect(lineValue(report, 'Total Expenses (USD)')).toBe('-0.01');
        expect(lineValue(report, 'Net Balance (USD)')).toBe('9.99');
      });
    });

    describe('income / expense filtering', () => {
      it('reports zero expenses when every transaction is income', async () => {
        mockRates({ EUR: 0.9 });

        const report = await strategy.execute([
          tx({ id: '1', amount: 100 }),
          tx({ id: '2', amount: 50 }),
        ]);

        expect(lineValue(report, 'Total Income (USD)')).toBe('150.00');
        expect(lineValue(report, 'Total Expenses (USD)')).toBe('0.00');
        expect(lineValue(report, 'Net Balance (USD)')).toBe('150.00');
        expect(lineValue(report, 'Total Expenses (EUR)')).toBe('0.00');
      });

      it('reports zero income when every transaction is an expense', async () => {
        mockRates({ EUR: 0.9 });

        const report = await strategy.execute([
          tx({ id: '1', amount: -75 }),
          tx({ id: '2', amount: -25 }),
        ]);

        expect(lineValue(report, 'Total Income (USD)')).toBe('0.00');
        expect(lineValue(report, 'Total Expenses (USD)')).toBe('-100.00');
        expect(lineValue(report, 'Net Balance (USD)')).toBe('-100.00');
        expect(lineValue(report, 'Average Transaction (USD)')).toBe('-50.00');
      });

      it('excludes zero-amount transactions from income and expenses but counts them in the average', async () => {
        mockRates({ GBP: 0.5, EUR: 0.9 });

        const report = await strategy.execute(
          [
            tx({ id: '1', amount: 100 }),
            tx({ id: '2', amount: 0 }),
            tx({ id: '3', amount: -20 }),
            tx({ id: '4', amount: 0 }),
          ],
          'GBP',
        );

        expect(lineValue(report, 'Total Income (USD)')).toBe('100.00');
        expect(lineValue(report, 'Total Expenses (USD)')).toBe('-20.00');
        // Average divides by 4, not by the 2 non-zero transactions.
        expect(lineValue(report, 'Average Transaction (USD)')).toBe('20.00');
        expect(lineValue(report, 'Average Transaction (GBP)')).toBe('10.00');
      });

      it('does not filter by status — pending and flagged rows are still aggregated', async () => {
        mockRates({ GBP: 0.5, EUR: 0.9 });

        const report = await strategy.execute(
          [
            tx({ id: '1', amount: 100, status: 'completed' }),
            tx({ id: '2', amount: 200, status: 'pending' }),
            tx({ id: '3', amount: -60, status: 'flagged' }),
          ],
          'GBP',
        );

        expect(lineValue(report, 'Total Income (USD)')).toBe('300.00');
        expect(lineValue(report, 'Total Expenses (USD)')).toBe('-60.00');
        expect(lineValue(report, 'Total Income (GBP)')).toBe('150.00');
      });
    });

    describe('grouping', () => {
      it('aggregates across categories rather than grouping by them', async () => {
        mockRates({ GBP: 0.5, EUR: 0.9 });

        const byCategory = await strategy.execute(
          [
            tx({ id: '1', amount: 100, category: 'Salary' }),
            tx({ id: '2', amount: 100, category: 'Freelance' }),
            tx({ id: '3', amount: -50, category: 'Food' }),
          ],
          'GBP',
        );
        const sameAmountsOneCategory = await strategy.execute(
          [
            tx({ id: '1', amount: 100, category: 'Salary' }),
            tx({ id: '2', amount: 100, category: 'Salary' }),
            tx({ id: '3', amount: -50, category: 'Salary' }),
          ],
          'GBP',
        );

        // Category never changes the output: totals are global, not per-group.
        expect(byCategory).toBe(sameAmountsOneCategory);
        expect(lineValue(byCategory, 'Total Income (GBP)')).toBe('100.00');
        expect(byCategory).not.toContain('Salary');
        expect(byCategory).not.toContain('Freelance');
      });
    });

    describe('edge case — no transactions', () => {
      it('reports zero totals for an empty transaction list', async () => {
        mockRates({ EUR: 0.9 });

        const report = await strategy.execute([]);

        expect(lineValue(report, 'Target Currency')).toBe('EUR');
        expect(lineValue(report, 'Total Income (USD)')).toBe('0.00');
        expect(lineValue(report, 'Total Expenses (USD)')).toBe('0.00');
        expect(lineValue(report, 'Net Balance (USD)')).toBe('0.00');
        expect(lineValue(report, 'Total Income (EUR)')).toBe('0.00');
        expect(lineValue(report, 'Total Expenses (EUR)')).toBe('0.00');
        expect(lineValue(report, 'Net Balance (EUR)')).toBe('0.00');
      });

      it('KNOWN DEFECT: average is NaN for an empty list (0 / 0)', async () => {
        mockRates({ EUR: 0.9 });

        const report = await strategy.execute([]);

        // Documents current behaviour. The average should be guarded so an empty
        // list renders "0.00" instead of "NaN"; update this test when it is fixed.
        expect(lineValue(report, 'Average Transaction (USD)')).toBe('NaN');
        expect(lineValue(report, 'Average Transaction (EUR)')).toBe('NaN');
      });

      it('still resolves the currency and rate with no transactions', async () => {
        const spy = mockRates({ EUR: 0.9, JPY: 155.4 });

        const report = await strategy.execute([], 'jpy');

        expect(spy).toHaveBeenCalledTimes(1);
        expect(report).toContain('Target Currency: JPY');
        expect(report).toContain('Exchange Rate (USD to JPY): 155.4');
      });
    });

    describe('report contents', () => {
      it('emits the eleven expected lines in order', async () => {
        mockRates({ GBP: 0.5, EUR: 0.9 });

        const report = await strategy.execute(
          [tx({ id: '1', amount: 1000 }), tx({ id: '2', amount: -400 })],
          'GBP',
        );

        expect(report).toBe(
          [
            'Multi-Currency Audit Report',
            'Target Currency: GBP',
            'Exchange Rate (USD to GBP): 0.5',
            'Total Income (USD): 1000.00',
            'Total Expenses (USD): -400.00',
            'Net Balance (USD): 600.00',
            'Average Transaction (USD): 300.00',
            'Total Income (GBP): 500.00',
            'Total Expenses (GBP): -200.00',
            'Net Balance (GBP): 300.00',
            'Average Transaction (GBP): 150.00',
          ].join('\n'),
        );
      });

      it('labels every monetary line with USD or the target currency', async () => {
        mockRates({ EUR: 0.9 });

        const report = await strategy.execute([tx({ amount: 100 })]);
        const lines = report.split('\n');

        expect(lines).toHaveLength(11);
        expect(lines[0]).toBe('Multi-Currency Audit Report');
        for (const label of [
          'Total Income',
          'Total Expenses',
          'Net Balance',
          'Average Transaction',
        ]) {
          expect(report).toContain(`${label} (USD):`);
          expect(report).toContain(`${label} (EUR):`);
        }
        // Every amount is formatted to exactly two decimals.
        for (const line of lines.slice(3)) {
          expect(line).toMatch(/: -?\d+\.\d{2}$/);
        }
      });

      it('does not leak the previous run’s currency between executions', async () => {
        mockRates({ EUR: 0.9, GBP: 0.5 });

        const gbp = await strategy.execute([tx({ amount: 100 })], 'GBP');
        const eur = await strategy.execute([tx({ amount: 100 })], 'EUR');

        expect(gbp).toContain('Total Income (GBP): 50.00');
        expect(eur).toContain('Total Income (EUR): 90.00');
      });

      it('does not mutate the input transactions', async () => {
        mockRates({ GBP: 0.5, EUR: 0.9 });
        const input = [tx({ id: '1', amount: 100 }), tx({ id: '2', amount: -40 })];
        const snapshot = structuredClone(input);

        await strategy.execute(input, 'GBP');

        expect(input).toEqual(snapshot);
      });
    });
  });
});