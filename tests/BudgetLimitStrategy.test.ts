import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BudgetLimitStrategy } from '../src/strategies/BudgetLimitStrategy.js';
import { BudgetService } from '../src/services/BudgetService.js';
import { Transaction } from '../src/models.js';

describe('BudgetLimitStrategy (Feature 1)', () => {
  let strategy: BudgetLimitStrategy;

  beforeEach(() => {
    strategy = new BudgetLimitStrategy();
    vi.restoreAllMocks();
  });

  it('should correctly identify categories that are over budget', async () => {
    // 1. Mock the BudgetService asynchronously
    const mockBudgets = { Food: 100, Rent: 1000 };
    const spy = vi
      .spyOn(BudgetService, 'getCategoryBudgets')
      .mockResolvedValue(mockBudgets);

    // 2. Set up test transactions
    const testTransactions: Transaction[] = [
      {
        id: '1',
        date: '2026-05-01',
        amount: -150.0,
        category: 'Food',
        description: 'Grocery',
        status: 'completed',
      }, // Over budget
      {
        id: '2',
        date: '2026-05-02',
        amount: -900.0,
        category: 'Rent',
        description: 'Apartment',
        status: 'completed',
      }, // Under budget
    ];

    // 3. Execute
    const result = await strategy.execute(testTransactions);

    // 4. Assert
    expect(spy).toHaveBeenCalled();
    expect(result).toContain('Food');
    expect(result).toContain('OVER BUDGET');
    expect(result).not.toContain('Rent over budget');
  });

  it('should group expenses correctly by category and sum them', async () => {
    //Mock the BudgetService asynchronously
    const mockBudgets = { Food: 100, Entertainment: 200 };
    const spy = vi
      .spyOn(BudgetService, 'getCategoryBudgets')
      .mockResolvedValue(mockBudgets);

    //Set up test transactions
    const transactions: Transaction[] = [
      {
        id: '1',
        date: '2026-05-01',
        amount: -60,
        category: 'Food',
        description: 'Groceries',
        status: 'completed',
      },
      {
        id: '2',
        date: '2026-05-02',
        amount: -50,
        category: 'Food',
        description: 'Restaurant',
        status: 'completed',
      },
      {
        id: '3',
        date: '2026-05-03',
        amount: -50,
        category: 'Entertainment',
        description: 'Movie',
        status: 'completed',
      },
    ];

    //Execute
    const result = await strategy.execute(transactions);

    //Assert
    expect(spy).toHaveBeenCalled();

    expect(result).toContain('Food');
    expect(result).toContain('Budget Limit: 100');
    expect(result).toContain('Actual Spending: 110');

    expect(result).toContain('Entertainment');
    expect(result).toContain('Budget Limit: 200');
    expect(result).toContain('Actual Spending: 50');
  });

  it('should calculate absolute overage amounts and percentage exceeded', async () => {
    const mockBudgets = { Food: 100 };
    vi.spyOn(BudgetService, 'getCategoryBudgets').mockResolvedValue(
      mockBudgets,
    );

    const transactions: Transaction[] = [
      {
        id: '1',
        date: '2026-05-01',
        amount: -150,
        category: 'Food',
        description: 'Groceries',
        status: 'completed',
      },
    ];

    const result = await strategy.execute(transactions);

    expect(result).toContain('Food');
    expect(result).toContain('Overage Amount: 50');
    // 50 / 100 = 50% over budget
    expect(result).toContain('Overage Percentage: 50');
  });

  it('should list the specific transactions contributing to categories that are over budget', async () => {
    const mockBudgets = { Food: 100, Banking: 500 };
    vi.spyOn(BudgetService, 'getCategoryBudgets').mockResolvedValue(
      mockBudgets,
    );

    const transactions: Transaction[] = [
      {
        id: '1',
        date: '2026-05-01',
        amount: -150,
        category: 'Food',
        description: 'Grocery Store',
        status: 'completed',
      },
      {
        id: '2',
        date: '2026-05-01',
        amount: -2000,
        category: 'Food',
        description: 'Mcdonalds Binge',
        status: 'completed',
      },
      {
        id: '3',
        date: '2026-05-01',
        amount: -700,
        category: 'Banking',
        description: 'Gambling',
        status: 'completed',
      },
    ];

    const result = await strategy.execute(transactions);

    expect(result).toContain('Grocery Store');
    expect(result).toContain('Mcdonalds Binge');
    expect(result).toContain('Gambling');
  });

  it('should handle scenarios where no categories are over budget', async () => {
    const mockBudgets = { Food: 500, Rent: 1000 };
    vi.spyOn(BudgetService, 'getCategoryBudgets').mockResolvedValue(
      mockBudgets,
    );

    const transactions: Transaction[] = [
      {
        id: '1',
        date: '2026-05-01',
        amount: -100,
        category: 'Food',
        description: 'Groceries',
        status: 'completed',
      },
      {
        id: '2',
        date: '2026-05-02',
        amount: -800,
        category: 'Rent',
        description: 'Apartment',
        status: 'completed',
      },
    ];

    const result = await strategy.execute(transactions);

    expect(result).toContain('Food');
    expect(result).toContain('Actual Spending: 100');
    expect(result).toContain('Rent');
    expect(result).toContain('Actual Spending: 800');
    expect(result).not.toContain('Food OVER BUDGET');
    expect(result).not.toContain('Rent OVER BUDGET');
  });

  it('should handle empty transaction list gracefully', async () => {
    const mockBudgets = { Food: 100, Rent: 1000 };
    vi.spyOn(BudgetService, 'getCategoryBudgets').mockResolvedValue(
      mockBudgets,
    );

    const result = await strategy.execute([]);

    expect(result).toBeDefined();
    expect(result).not.toContain('OVER BUDGET');
    expect(result).toContain('No transaction history found.');
  });

  it('should ignore income transactions when calculating expenses', async () => {
    const mockBudgets = { Food: 100 };
    vi.spyOn(BudgetService, 'getCategoryBudgets').mockResolvedValue(
      mockBudgets,
    );

    const transactions: Transaction[] = [
      {
        id: '1',
        date: '2026-05-01',
        amount: -50,
        category: 'Food',
        description: 'Groceries',
        status: 'completed',
      },
      {
        id: '2',
        date: '2026-05-02',
        amount: 1000,
        category: 'Food',
        description: 'Paycheck',
        status: 'completed',
      },
    ];

    const result = await strategy.execute(transactions);

    expect(result).toContain('Actual Spending: 50');
    expect(result).not.toContain('Actual Spending: -950');
  });
});
