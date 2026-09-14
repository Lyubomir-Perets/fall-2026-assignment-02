import { Transaction } from '../models.js';
import { ExchangeRateService } from '../services/ExchangeRateService.js';
import { AuditStrategy } from './AuditStrategy.js';

export class MultiCurrencyStrategy implements AuditStrategy {
  public readonly name = 'Multi-Currency Auditor';
  public readonly description =
    'Converts and aggregates transactions in a foreign currency';

  public async execute(
    transactions: Transaction[],
    customParam?: string,
  ): Promise<string> {
    // TODO: Feature 5 - Implement this strategy.
    // 1. Call ExchangeRateService.getExchangeRates() asynchronously.
    const exchangeRates = await ExchangeRateService.getExchangeRates('USD');
    // 2. Identify the target currency from `customParam` (default to 'EUR' if invalid/not provided).
    const requested = customParam?.toUpperCase() || 'EUR';
    const targetCurrency = requested && exchangeRates.rates[requested] !== undefined ? requested : 'EUR';  
    // 3. Look up the exchange rate for the target currency (throw an error if not found in rates).
    const rate = exchangeRates.rates[targetCurrency];
    if (rate === undefined) {
      throw new Error(`Exchange rate for ${targetCurrency} not found.`);
    }
    // 4. Convert all transaction amounts to the target currency.
    const converted = transactions.map((transaction) => ({
      ...transaction,
      amountUSD: transaction.amount, amountTarget: transaction.amount * rate,
    }));
    // 5. Calculate total income, total expenses, and net balance in BOTH USD and target currency.
    const incomeUSD = converted.filter(t => t.amountUSD > 0).reduce((sum, t) => sum + t.amountUSD, 0);
    const expensesUSD = converted.filter(t => t.amountUSD < 0).reduce((sum, t) => sum + t.amountUSD, 0);
    const netUSD = incomeUSD + expensesUSD;
    const avgUSD = converted.reduce((sum, t) => sum + t.amountUSD, 0) / converted.length;

    const incomeTGT = incomeUSD * rate;
    const expensesTGT = expensesUSD * rate;
    const netTGT = incomeTGT + expensesTGT;
    const avgTGT = avgUSD * rate;
    // 6. Format and return a text-based audit report detailing conversion metrics, conversion rate used, and transaction summaries in both currencies.

    throw new Error('Method not implemented.');
  }
}
