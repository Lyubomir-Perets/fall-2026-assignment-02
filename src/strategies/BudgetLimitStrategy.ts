import { toUSVString } from 'util';
import { Transaction } from '../models.js';
import { BudgetService } from '../services/BudgetService.js';
import { AuditStrategy } from './AuditStrategy.js';

export class BudgetLimitStrategy implements AuditStrategy {
  public readonly name = 'Budget Limit Auditor';
  public readonly description =
    'Checks category spending against monthly budget limits';

  public async execute(
    transactions: Transaction[],
    customParam?: string,
  ): Promise<string> {
    // TODO: Feature 1 - Implement this strategy.
    // 1. Call BudgetService.getCategoryBudgets() asynchronously.
    // 2. Group expenses (amounts < 0) by category and compute total spending for each category.
    // 3. Compare spending against the fetched limits.
    // 4. Identify overages (categories where spending exceeds the budget).
    // 5. Format and return a text-based audit report outlining limits, actuals, overage amounts, percentages, and lists of transactions causing the overage.

    //fetch budget limits from remote database
    const budgetLimits = await BudgetService.getCategoryBudgets();

    //filter out non expenses
    const expenses = transactions.filter((transaction) => {
      return transaction.amount < 0;
    });

    //group expenses by category
    const categoried = expenses.reduce<Record<string, Transaction[]>>(
      (categories, transaction) => {
        if (!categories[transaction.category]) {
          categories[transaction.category] = [];
        }

        categories[transaction.category].push(transaction);

        return categories;
      },
      {},
    );

    //sum total expenses for each category
    const totalExpenses: Record<string, number> = {};
    Object.keys(categoried).forEach((category) => {
      totalExpenses[category] = 0;
      categoried[category].forEach((transaction: Transaction) => {
        totalExpenses[category] += -transaction.amount;
      });
    });

    //Compare total spending to budget limit by category
    const expenseVSBudget: Record<string, number> = {};
    Object.keys(totalExpenses).forEach((category) => {
      expenseVSBudget[category] =
        budgetLimits[category] - totalExpenses[category];
    });

    //get categories that overspent and calculate overspend[0] and percentage exceeded[1]
    const exceededCategories: Record<string, number[]> = {};
    Object.keys(expenseVSBudget).forEach((category) => {
      if (expenseVSBudget[category] < 0) {
        exceededCategories[category] = [];
        exceededCategories[category][0] = -expenseVSBudget[category];
        exceededCategories[category][1] =
          ((totalExpenses[category] - budgetLimits[category]) /
            budgetLimits[category]) *
          100;
      }
    });

    //SUMARRY OUTPUT

    //Summary
    let report = 'Summary Report\n';
    let num = 0;
    Object.keys(totalExpenses).forEach((category) => {
      num++;
      report +=
        `\n${num}.` +
        category +
        ' -> Budget Limit: ' +
        budgetLimits[category] +
        ' , Actual Spending: ' +
        totalExpenses[category];
    });

    //Over Budget Categories
    num = 0;
    report += '\n\nOver-Budget Categories:';
    Object.keys(exceededCategories).forEach((category) => {
      num++;
      report +=
        `\n${num}.` +
        category +
        ' OVER BUDGET -> Overage Amount: ' +
        exceededCategories[category][0] +
        ' , Overage Percentage: ' +
        exceededCategories[category][1] +
        '\nList of all transactions leading to overage:';
      categoried[category].forEach((transaction) => {
        report +=
          '\n  -' +
          `${transaction.date}: $${-transaction.amount} - ${transaction.description}`;
      });
    });

    if (Object.keys(transactions).length === 0)
      report = 'No transaction history found.';

    return report;

    throw new Error('Method not implemented.');
  }
}
