import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AnomalyDetectionStrategy } from '../src/strategies/AnomalyDetectionStrategy.js';
import { AnomalyRulesService } from '../src/services/AnomalyRulesService.js';
import { Transaction } from '../src/models.js';

describe('AnomalyDetectionStrategy (Feature 2)', () => {
  let strategy: AnomalyDetectionStrategy;

  const baseRules = { maxTransactionAmount: 500.0, flaggedStatuses: ['flagged'] };

  beforeEach(() => {
    strategy = new AnomalyDetectionStrategy();
    vi.restoreAllMocks();
  });

  it('should detect outlier transactions exceeding threshold', async () => {
    const spy = vi
      .spyOn(AnomalyRulesService, 'getRules')
      .mockResolvedValue(baseRules);

    const testTransactions: Transaction[] = [
      { id: '1', date: '2026-05-01', amount: -600.0, category: 'Shopping', description: 'Laptop', status: 'completed' },
      { id: '2', date: '2026-05-02', amount: -100.0, category: 'Food', description: 'Grocery', status: 'completed' },
    ];

    const result = await strategy.execute(testTransactions);

    expect(spy).toHaveBeenCalled();
    expect(result).toContain('Laptop');
    expect(result).toContain('Outlier');
  });

  it('should detect outlier transactions exceeding the configured max amount limit', async () => {
    vi.spyOn(AnomalyRulesService, 'getRules').mockResolvedValue(baseRules);

    const testTransactions: Transaction[] = [
      { id: '1', date: '2026-05-01', amount: -501.0, category: 'Travel', description: 'Flight', status: 'completed' }, // Just over
      { id: '2', date: '2026-05-02', amount: -500.0, category: 'Travel', description: 'Flight', status: 'completed' }, // Exactly at limit — NOT an outlier
      { id: '3', date: '2026-05-03', amount: -499.99, category: 'Food', description: 'Dinner', status: 'completed' }, // Under
    ];

    const result = await strategy.execute(testTransactions);

    expect(result).toContain('Flight');
    expect(result).toContain('Outliers (1)');
    expect(result).toContain('[1]');
    expect(result).not.toContain('[2]');
    expect(result).not.toContain('[3]');
  });

  it('should identify duplicate transactions sharing identical date, amount, category, and description', async () => {
    vi.spyOn(AnomalyRulesService, 'getRules').mockResolvedValue(baseRules);

    const testTransactions: Transaction[] = [
      { id: '1', date: '2026-05-01', amount: -25.0, category: 'Food', description: 'Coffee', status: 'completed' },
      { id: '2', date: '2026-05-01', amount: -25.0, category: 'Food', description: 'Coffee', status: 'completed' }, // Duplicate of 1
      { id: '3', date: '2026-05-01', amount: -25.0, category: 'Food', description: 'Coffee', status: 'completed' }, // Duplicate of 1
      { id: '4', date: '2026-05-02', amount: -25.0, category: 'Food', description: 'Coffee', status: 'completed' }, // Different date — not a dup
      { id: '5', date: '2026-05-01', amount: -30.0, category: 'Food', description: 'Coffee', status: 'completed' }, // Different amount — not a dup
    ];

    const result = await strategy.execute(testTransactions);

    expect(result).toContain('Duplicate Sets (1)');
    expect(result).toContain('Set 1 (3 copies)');
    expect(result).toContain('[1]');
    expect(result).toContain('[2]');
    expect(result).toContain('[3]');
    expect(result).not.toContain('[4]');
    expect(result).not.toContain('[5]');
  });

  it('should flag transactions matching standard flagged statuses in the rules', async () => {
    vi.spyOn(AnomalyRulesService, 'getRules').mockResolvedValue({
      maxTransactionAmount: 500.0,
      flaggedStatuses: ['flagged', 'suspicious'],
    });

    const testTransactions: Transaction[] = [
      { id: '1', date: '2026-05-01', amount: -50.0, category: 'Food', description: 'Lunch', status: 'flagged' },
      { id: '2', date: '2026-05-02', amount: -80.0, category: 'Travel', description: 'Uber', status: 'suspicious' },
      { id: '3', date: '2026-05-03', amount: -20.0, category: 'Food', description: 'Snacks', status: 'completed' }, // Not flagged
    ];

    const result = await strategy.execute(testTransactions);

    expect(result).toContain('Status Flags (2)');
    expect(result).toContain('[1]');
    expect(result).toContain('[2]');
    expect(result).not.toContain('[3]');
  });

  it('should calculate correct transaction anomaly rates and total flagged valuation', async () => {
    vi.spyOn(AnomalyRulesService, 'getRules').mockResolvedValue(baseRules);

    const testTransactions: Transaction[] = [
      { id: '1', date: '2026-05-01', amount: -600.0, category: 'Shopping', description: 'Laptop', status: 'flagged' }, // Outlier AND flagged — counted once
      { id: '2', date: '2026-05-01', amount: -600.0, category: 'Shopping', description: 'Laptop', status: 'flagged' }, // Duplicate of 1 — same set
      { id: '3', date: '2026-05-02', amount: -100.0, category: 'Food', description: 'Grocery', status: 'completed' }, // Normal
    ];

    const result = await strategy.execute(testTransactions);

    // 2 of 3 transactions are anomalous → 66.67%
    expect(result).toContain('Total anomalous transactions: 2 of 3');
    expect(result).toContain('Anomaly rate:                 66.67%');
    // Total flagged value = |−600| + |−600| = 1200
    expect(result).toContain('Total flagged value:          $1200.00');
  });

  it('should output a clean, readable text audit report detailing warnings', async () => {
    vi.spyOn(AnomalyRulesService, 'getRules').mockResolvedValue(baseRules);

    const testTransactions: Transaction[] = [
      { id: '1', date: '2026-05-01', amount: -750.0, category: 'Travel', description: 'Flight', status: 'flagged' },
    ];

    const result = await strategy.execute(testTransactions);

    expect(result).toContain('=== Anomaly & Duplicate Audit Report ===');
    expect(result).toContain('Transactions reviewed: 1');
    expect(result).toContain('Max allowed expense:   $500.00');
    expect(result).toContain('Flagged statuses:      flagged');
    expect(result).toContain('Outliers (1):');
    expect(result).toContain('Duplicate Sets (0):');
    expect(result).toContain('Status Flags (1):');
    expect(result).toContain('--- Summary ---');
  });

  it('should handle an empty transaction list gracefully', async () => {
    vi.spyOn(AnomalyRulesService, 'getRules').mockResolvedValue(baseRules);

    const result = await strategy.execute([]);

    expect(result).toContain('Transactions reviewed: 0');
    expect(result).toContain('Outliers (0):');
    expect(result).toContain('Duplicate Sets (0):');
    expect(result).toContain('Status Flags (0):');
    expect(result).toContain('Total anomalous transactions: 0 of 0');
    expect(result).toContain('Anomaly rate:                 0.00%');
    expect(result).toContain('Total flagged value:          $0.00');
    
  });
});
