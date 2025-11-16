export interface ExpenseSummary {
  period: { start: string; end: string };
  total: number;
  currency: string;
  count: number;
  byCategory: Array<{
    category: string;
    amount: number;
    percentage: number;
    count: number;
  }>;
  byPaymentMethod: Array<{
    method: string;
    amount: number;
    count: number;
  }>;
  dailyAverage: number;
  trend: 'increasing' | 'decreasing' | 'stable';
  topExpenses: any[];
}
