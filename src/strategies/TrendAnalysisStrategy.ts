import { Transaction } from '../models.js';
import { HistoricalDataService } from '../services/HistoricalDataService.js';
import { AuditStrategy } from './AuditStrategy.js';

export class TrendAnalysisStrategy implements AuditStrategy {
  public readonly name = 'Historical Trend Auditor';
  public readonly description =
    'Compares current monthly category spending against historical averages';

  public async execute(
    transactions: Transaction[],
    customParam?: string,
  ): Promise<string> {
    const SIGNIFICANT_VARIANCE_THRESHOLD = 20;

    // TODO: Feature 3 - Implement this strategy.
    // 1. Call HistoricalDataService.getHistoricalAverages() asynchronously.
    const historicalAverages = await HistoricalDataService.getHistoricalAverages();
    // 2. Group current expenses (amount < 0) by category and compute category totals.
    const currentTotals: Record<string, number> = {};
    for (const t of transactions) {
      if (t.amount < 0) {
        currentTotals[t.category] = 
          (currentTotals[t.category] ?? 0) + Math.abs(t.amount);
      } 
    }
    const allCategories = Array.from(
      new Set([...Object.keys(currentTotals), ...Object.keys(historicalAverages)]), ).sort();
    interface CategoryTrend {
      category: string;
      current: number;
      historical: number;
      variance: number | null; //for fault tolerance when historical average is 0
    }
    // 3. For each category, compare current total spending against the historical average.
    // 4. Calculate the rate of change / variance percentage: ((current - historical) / historical) * 100.
  const trends: CategoryTrend[] = allCategories.map((category) =>{
    const current = currentTotals[category] ?? 0;
    const historical = historicalAverages[category] ?? 0;
    const variance =
      historical === 0 ? null : ((current - historical) / historical) * 100;
    return { category, current, historical, variance };
  });
    // 5. Highlight any category with a variance exceeding +/- 20%.
    const growthCategories = trends.filter(
      (t) => t.variance !== null && t.variance > SIGNIFICANT_VARIANCE_THRESHOLD,
    );
    const savingsCategories = trends.filter(
      (t) => t.variance !== null && t.variance < -SIGNIFICANT_VARIANCE_THRESHOLD,
    );
    // 6. Format and return a text-based audit report detailing comparison metrics.
    const lines: string[] = [];
    lines.push('Historical Trend Audit Report');
    lines.push(' ');
    lines.push('Category Breakdown (Current vs Historical Average):');

    if (trends.length === 0) {
      lines.push(' No Categories to Report');
    } else {
      for (const t of trends) {
        const varianceStr =
        t.variance === null ? 'N/A' : `${t.variance >= 0 ? '+' : ''}${t.variance.toFixed(1)}%`;
        lines.push(`  ${t.category}: Current $${t.current.toFixed(2)} | ` + `Historical $${t.historical.toFixed(2)} | Change: ${varianceStr}`,
        );
      }
    }
    lines.push('');
    lines.push('Significant Growth Categories (> +20%):');
    if (growthCategories.length === 0) {
      lines.push(' None');
    } else {
      for (const t of growthCategories) {
        lines.push(` ${t.category}: +${(t.variance as number).toFixed(1)}%`);
      }
    }

    lines.push('');
    lines.push('Significant Savings Categories (< -20%):');
    if (savingsCategories.length === 0) {
      lines.push(' None');
    } else {
      for (const t of savingsCategories) {
        lines.push(` ${t.category}: ${(t.variance as number).toFixed(1)}%`);
      }
    }
    return lines.join('\n');
  }
}