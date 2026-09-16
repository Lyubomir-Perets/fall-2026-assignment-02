import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TrendAnalysisStrategy } from '../src/strategies/TrendAnalysisStrategy.js';
import { HistoricalDataService } from '../src/services/HistoricalDataService.js';
import { Transaction } from '../src/models.js';

describe('TrendAnalysisStrategy (Feature 3)', () => {
  let strategy: TrendAnalysisStrategy;

  beforeEach(() => {
    strategy = new TrendAnalysisStrategy();
    vi.restoreAllMocks();
  });

  // Example of how to write and mock in your tests:
  //
  // it('should compute correct spending variances against historical averages', async () => {
  //   const mockAverages = { Food: 200, Rent: 1000 };
  //   const spy = vi.spyOn(HistoricalDataService, 'getHistoricalAverages').mockResolvedValue(mockAverages);
  //
  //   const testTransactions: Transaction[] = [
  //     { id: '1', date: '2026-05-01', amount: -250.00, category: 'Food', description: 'Grocery', status: 'completed' }, // +25% change
  //     { id: '2', date: '2026-05-02', amount: -1000.00, category: 'Rent', description: 'Apartment', status: 'completed' }, // 0% change
  //   ];
  //
  //   const result = await strategy.execute(testTransactions);
  //
  //   expect(spy).toHaveBeenCalled();
  //   expect(result).toContain('+25'); // growth detected
  //   expect(result).toContain('Food');
  // });

  it(
    'should group current expenses by category and compute accurate totals', async () => {
      const mockAverages = { Food: 200 };
      const spy = vi
        .spyOn(HistoricalDataService, 'getHistoricalAverages')
        .mockResolvedValue(mockAverages);

      const testTransactions: Transaction[] = [
        {
        id: '1',
        date: '2026-05-01',
        amount: -60.0,
        category: 'Food',
        description: 'Groceries',
        status: 'completed',
      },
      {
        id: '2',
        date: '2026-05-02',
        amount: -40.0,
        category: 'Food',
        description: 'Takeout',
        status: 'completed',
      },
      {
        id: '3',
        date: '2026-05-03',
        amount: 500.0,
        category: 'Food',
        description: 'Refund',
        status: 'completed',
      }
    ];
    const result = await strategy.execute(testTransactions);

    expect(spy).toHaveBeenCalledTimes(1);
    expect(result).toContain('Current $100.00');
});

  it(
    'should highlight categories exceeding positive/negative 20% variance threshold', async() => {
      const mockAverages = {
        Food: 200,
        Entertainment: 100,
        Utilities: 150,
      };
      vi.spyOn(HistoricalDataService, 'getHistoricalAverages').mockResolvedValue(
        mockAverages,
      );

      const testTransactions: Transaction[] = [
        {
        id: '1',
        date: '2026-05-01',
        amount: -250.0,
        category: 'Food',
        description: 'Groceries',
        status: 'completed',
      },
      {
        id: '2',
        date: '2026-05-02',
        amount: -70.0,
        category: 'Entertainment',
        description: 'Movies',
        status: 'completed',
      },
      {
        id: '3',
        date: '2026-05-03',
        amount: -160.0,
        category: 'Utilities',
        description: 'Electric Bill',
        status: 'completed',
      }
    ];
    const result = await strategy.execute(testTransactions);

    expect(result).toContain('Significant Growth Categories');
    expect(result).toContain('Food');
    expect(result).toContain('+25.0%');

    expect(result).toContain('Significant Savings Categories');
    expect(result).toContain('Entertainment');
    expect(result).toContain('-30.0%');

    const [breakdown, rest] = result.split('Significant Growth Categories');
    expect(breakdown).toContain('Utilities');
    expect(rest).not.toMatch(/Utilities/);
    });

  it(
    'should handle categories present in current data but missing in historical benchmarks', async () => {
      vi.spyOn(HistoricalDataService, 'getHistoricalAverages').mockResolvedValue({
        Food: 200,
      });

      const testTransactions: Transaction[] = [
        {
        id: '1',
        date: '2026-05-01',
        amount: -75.0,
        category: 'NewCategory',
        description: 'First Purchase in this New Category',
        status: 'completed',
      },
    ];

       const result = await strategy.execute(testTransactions);

    expect(result).toContain('NewCategory');
    expect(result).toContain('N/A');
    const [beforeGrowth, afterGrowth] = result.split('Significant Growth Categories');
    expect(afterGrowth).not.toContain('NewCategory');
  });
});