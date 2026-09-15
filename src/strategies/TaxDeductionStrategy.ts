import { Transaction } from '../models.js';
import { TaxConfigService } from '../services/TaxConfigService.js';
import { AuditStrategy } from './AuditStrategy.js';

export class TaxDeductionStrategy implements AuditStrategy {
  public readonly name = 'Tax & Deductions Auditor';
  public readonly description =
    'Identifies eligible tax-deductible expenses and estimates savings';

  public async execute(
    transactions: Transaction[],
    _customParam?: string,
  ): Promise<string> {
    // 1. Asynchronously fetch the tax rate and eligible deductible categories.
    const config = await TaxConfigService.getTaxConfig();
    const { standardTaxRate, deductibleCategories } = config;

    // 2. Split expenses (amount < 0) into deductible and non-deductible buckets.
    //    Income is ignored: it is neither deductible nor VAT-bearing.
    const expenses = transactions.filter((t) => t.amount < 0);
    const deductible = expenses.filter((t) =>
      deductibleCategories.includes(t.category),
    );
    const nonDeductible = expenses.filter(
      (t) => !deductibleCategories.includes(t.category),
    );

    // 3. Sum the absolute total of all eligible deductions.
    const totalDeductions = deductible.reduce(
      (sum, t) => sum + Math.abs(t.amount),
      0,
    );

    // 4. Estimate tax savings on those deductions.
    const estimatedSavings = totalDeductions * standardTaxRate;

    // 5. Estimate sales tax / VAT already paid on regular, non-deductible spending.
    const totalNonDeductible = nonDeductible.reduce(
      (sum, t) => sum + Math.abs(t.amount),
      0,
    );
    const estimatedVat = totalNonDeductible * standardTaxRate;

    // 6. Format the report: aggregates first, then the itemized deductible list.
    const itemized =
      deductible.length > 0
        ? deductible
            .map(
              (t) =>
                `  - ${t.date} | ${t.category} | ${t.description} | $${Math.abs(
                  t.amount,
                ).toFixed(2)}`,
            )
            .join('\n')
        : '  (none)';

    const categoryList =
      deductibleCategories.length > 0 ? deductibleCategories.join(', ') : 'None';

    return (
      `TAX & DEDUCTIONS AUDIT REPORT\n` +
      `Standard Tax Rate: ${(standardTaxRate * 100).toFixed(1)}%\n` +
      `Deductible Categories: ${categoryList}\n` +
      `\n` +
      `SUMMARY\n` +
      `Total Deductions: $${totalDeductions.toFixed(2)}\n` +
      `Estimated Tax Savings: $${estimatedSavings.toFixed(2)}\n` +
      `Total Non-Deductible Expenses: $${totalNonDeductible.toFixed(2)}\n` +
      `Estimated Sales Tax (VAT) Paid: $${estimatedVat.toFixed(2)}\n` +
      `\n` +
      `ELIGIBLE DEDUCTIBLE TRANSACTIONS (${deductible.length})\n` +
      itemized
    );
  }
}
