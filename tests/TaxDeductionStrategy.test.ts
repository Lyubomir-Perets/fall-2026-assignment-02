import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TaxDeductionStrategy } from '../src/strategies/TaxDeductionStrategy.js';
import { TaxConfigService } from '../src/services/TaxConfigService.js';
import { Transaction, TaxConfig } from '../src/models.js';

describe('TaxDeductionStrategy (Feature 4)', () => {
  let strategy: TaxDeductionStrategy;

  beforeEach(() => {
    strategy = new TaxDeductionStrategy();
    vi.restoreAllMocks();
  });

  const mockConfig: TaxConfig = {
    standardTaxRate: 0.1,
    deductibleCategories: ['Charity', 'Medical'],
  };

  const mockTaxConfig = (config: TaxConfig = mockConfig) =>
    vi.spyOn(TaxConfigService, 'getTaxConfig').mockResolvedValue(config);

  const tx = (overrides: Partial<Transaction> & { id: string }): Transaction => ({
    date: '2026-05-01',
    amount: -100.0,
    category: 'Food',
    description: 'Groceries',
    status: 'completed',
    ...overrides,
  });

  it('should filter only the categories specified as deductible in the config', async () => {
    const spy = mockTaxConfig();

    const testTransactions: Transaction[] = [
      tx({ id: '1', amount: -200.0, category: 'Charity', description: 'Donation' }),
      tx({ id: '2', amount: -50.0, category: 'Medical', description: 'Pharmacy' }),
      tx({ id: '3', amount: -100.0, category: 'Food', description: 'Groceries' }),
      tx({ id: '4', amount: -75.0, category: 'Shopping', description: 'Clothes' }),
    ];

    const result = await strategy.execute(testTransactions);

    expect(spy).toHaveBeenCalledTimes(1);
    // Deductible categories are itemized...
    expect(result).toContain('Donation');
    expect(result).toContain('Pharmacy');
    // ...non-deductible categories are not.
    expect(result).not.toContain('Groceries');
    expect(result).not.toContain('Clothes');
    // Only Charity + Medical count toward the deduction total ($250, not $425).
    expect(result).toContain('Deductions: $250.00');
  });

  it('should exclude income and only count expenses (amount < 0) as deductions', async () => {
    mockTaxConfig();

    const testTransactions: Transaction[] = [
      tx({ id: '1', amount: -200.0, category: 'Charity', description: 'Donation' }),
      // Income posted to a deductible category must not be treated as a deduction.
      tx({ id: '2', amount: 500.0, category: 'Charity', description: 'Refunded pledge' }),
    ];

    const result = await strategy.execute(testTransactions);

    expect(result).toContain('Deductions: $200.00');
    expect(result).not.toContain('Refunded pledge');
  });

  it('should sum total eligible tax deductions correctly', async () => {
    mockTaxConfig();

    const testTransactions: Transaction[] = [
      tx({ id: '1', amount: -200.0, category: 'Charity', description: 'Donation' }),
      tx({ id: '2', amount: -125.5, category: 'Medical', description: 'Dentist' }),
      tx({ id: '3', amount: -24.5, category: 'Medical', description: 'Prescription' }),
      tx({ id: '4', amount: -100.0, category: 'Food', description: 'Groceries' }),
    ];

    const result = await strategy.execute(testTransactions);

    // 200.00 + 125.50 + 24.50 = 350.00, reported as a positive (absolute) total.
    expect(result).toContain('Deductions: $350.00');
  });

  it('should calculate estimated tax savings using standardTaxRate', async () => {
    mockTaxConfig({ standardTaxRate: 0.25, deductibleCategories: ['Business'] });

    const testTransactions: Transaction[] = [
      tx({ id: '1', amount: -400.0, category: 'Business', description: 'Software license' }),
      tx({ id: '2', amount: -100.0, category: 'Food', description: 'Groceries' }),
    ];

    const result = await strategy.execute(testTransactions);

    // $400 deductible * 25% = $100 savings.
    expect(result).toContain('Deductions: $400.00');
    expect(result).toContain('Savings: $100.00');
  });

  it('should calculate estimated VAT/sales tax paid on non-deductible expense transactions', async () => {
    mockTaxConfig({ standardTaxRate: 0.08, deductibleCategories: ['Charity'] });

    const testTransactions: Transaction[] = [
      tx({ id: '1', amount: -100.0, category: 'Charity', description: 'Donation' }),
      tx({ id: '2', amount: -150.0, category: 'Food', description: 'Groceries' }),
      tx({ id: '3', amount: -100.0, category: 'Shopping', description: 'Clothes' }),
      // Income must be excluded from the VAT base as well.
      tx({ id: '4', amount: 1000.0, category: 'Salary', description: 'Paycheck' }),
    ];

    const result = await strategy.execute(testTransactions);

    // Non-deductible expenses = 150 + 100 = $250; VAT = $250 * 8% = $20.00.
    // The deductible $100 and the $1000 income are not part of the VAT base
    // (a $1350 base would yield $108.00, a $350 base $28.00).
    expect(result).toContain('$20.00');
    expect(result).not.toContain('$108.00');
    expect(result).not.toContain('$28.00');
  });

  it('should structure report to show both aggregates and itemized deductible transactions', async () => {
    mockTaxConfig();

    const testTransactions: Transaction[] = [
      tx({
        id: 'tx-1',
        date: '2026-05-01',
        amount: -200.0,
        category: 'Charity',
        description: 'Donation',
      }),
      tx({
        id: 'tx-2',
        date: '2026-05-02',
        amount: -100.0,
        category: 'Medical',
        description: 'Dentist',
      }),
      tx({
        id: 'tx-3',
        date: '2026-05-03',
        amount: -50.0,
        category: 'Food',
        description: 'Groceries',
      }),
    ];

    const result = await strategy.execute(testTransactions);

    // Aggregates: total deductions, estimated savings, estimated VAT.
    expect(result).toContain('Deductions: $300.00');
    expect(result).toContain('Savings: $30.00');
    expect(result).toContain('$5.00'); // VAT on the $50 non-deductible expense

    // Itemized detail for each qualifying transaction: date, category, description, amount.
    expect(result).toContain('2026-05-01');
    expect(result).toContain('Charity');
    expect(result).toContain('Donation');
    expect(result).toContain('$200.00');

    expect(result).toContain('2026-05-02');
    expect(result).toContain('Medical');
    expect(result).toContain('Dentist');
    expect(result).toContain('$100.00');

    // Report is multi-line, not a single flat sentence.
    expect(result.split('\n').length).toBeGreaterThan(3);
  });

  it('should handle an empty transaction list without crashing', async () => {
    mockTaxConfig();

    const result = await strategy.execute([]);

    expect(result).toContain('Deductions: $0.00');
    expect(result).toContain('Savings: $0.00');
    expect(result).toContain('$0.00');
  });

  it('should report zero deductions when the config lists no deductible categories', async () => {
    mockTaxConfig({ standardTaxRate: 0.08, deductibleCategories: [] });

    const testTransactions: Transaction[] = [
      tx({ id: '1', amount: -200.0, category: 'Charity', description: 'Donation' }),
      tx({ id: '2', amount: -50.0, category: 'Food', description: 'Groceries' }),
    ];

    const result = await strategy.execute(testTransactions);

    expect(result).toContain('Deductions: $0.00');
    expect(result).toContain('Savings: $0.00');
    // Everything falls into the VAT base: $250 * 8% = $20.00.
    expect(result).toContain('$20.00');
  });
});
