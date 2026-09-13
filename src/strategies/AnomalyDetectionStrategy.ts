import { Transaction } from '../models.js';
import { AnomalyRulesService } from '../services/AnomalyRulesService.js';
import { AuditStrategy } from './AuditStrategy.js';

export class AnomalyDetectionStrategy implements AuditStrategy {
  public readonly name = 'Anomaly & Duplicate Auditor';
  public readonly description =
    'Detects transactions exceeding thresholds and duplicate records';

  public async execute(
    transactions: Transaction[],
    customParam?: string,
  ): Promise<string> {
    // 1. Fetch threshold rules from the mock service (async).
    const rules = await AnomalyRulesService.getRules();

    // 2. Outliers: expenses whose absolute amount exceeds the max rule.
    const outliers = transactions.filter(
      (t) => t.amount < 0 && Math.abs(t.amount) > rules.maxTransactionAmount,
    );

    // 3. Duplicates: identical date, category, description, and amount.
    const groups = new Map<string, Transaction[]>();
    for (const t of transactions) {
      const key = `${t.date}|${t.category}|${t.description}|${t.amount}`;
      const bucket = groups.get(key) ?? [];
      bucket.push(t);
      groups.set(key, bucket);
    }
    const duplicateSets = [...groups.values()].filter(
      (group) => group.length > 1,
    );

    // 4. Status flags: transactions matching any flagged status in the rules.
    const statusFlags = transactions.filter((t) =>
      rules.flaggedStatuses.includes(t.status),
    );

    // 5. Anomaly stats — use a Set of ids so overlapping categories
    //    (e.g. an outlier that is also flagged) are counted only once.
    const anomalousIds = new Set<string>([
      ...outliers.map((t) => t.id),
      ...duplicateSets.flat().map((t) => t.id),
      ...statusFlags.map((t) => t.id),
    ]);
    const anomalousCount = anomalousIds.size;
    const totalCount = transactions.length;
    const anomalyRate =
      totalCount === 0 ? 0 : (anomalousCount / totalCount) * 100;
    const totalFlaggedValue = [...anomalousIds]
      .map((id) => transactions.find((t) => t.id === id))
      .filter((t): t is Transaction => t !== undefined)
      .reduce((sum, t) => sum + Math.abs(t.amount), 0);

        // 6. Format the report.
    const fmt = (t: Transaction) =>
      `  - [${t.id}] ${t.date} | ${t.category} | ${t.description} | $${t.amount.toFixed(2)} | status: ${t.status}`;

    const lines: string[] = [];
    lines.push('=== Anomaly & Duplicate Audit Report ===');
    lines.push(`Transactions reviewed: ${totalCount}`);
    lines.push(`Max allowed expense:   $${rules.maxTransactionAmount.toFixed(2)}`);
    lines.push(`Flagged statuses:      ${rules.flaggedStatuses.join(', ') || '(none)'}`);
    lines.push('');

    lines.push(`Outliers (${outliers.length}):`);
    lines.push(
      outliers.length > 0
        ? outliers.map(fmt).join('\n')
        : '  None detected.',
    );
    lines.push('');

    lines.push(`Duplicate Sets (${duplicateSets.length}):`);
    if (duplicateSets.length > 0) {
      duplicateSets.forEach((group, i) => {
        lines.push(`  Set ${i + 1} (${group.length} copies):`);
        lines.push(group.map(fmt).join('\n'));
      });
    } else {
      lines.push('  None detected.');
    }
    lines.push('');

    lines.push(`Status Flags (${statusFlags.length}):`);
    lines.push(
      statusFlags.length > 0
        ? statusFlags.map(fmt).join('\n')
        : '  None detected.',
    );
    lines.push('');

    lines.push('--- Summary ---');
    lines.push(`Total anomalous transactions: ${anomalousCount} of ${totalCount}`);
    lines.push(`Anomaly rate:                 ${anomalyRate.toFixed(2)}%`);
    lines.push(
      `Total flagged value:          $${totalFlaggedValue.toFixed(2)}`,
    );

    return lines.join('\n');
  }
}