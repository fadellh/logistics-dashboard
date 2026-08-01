// Pure, DB-independent forecasting math. Zero imports from ../db/client or anything
// that touches DATABASE_URL — this is what lets forecast.test.ts run without a .env file.

export function linearRegression(x: number[], y: number[]): { slope: number; intercept: number } {
  const n = x.length;
  const xMean = x.reduce((a, b) => a + b, 0) / n;
  const yMean = y.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (x[i] - xMean) * (y[i] - yMean);
    den += (x[i] - xMean) ** 2;
  }
  const slope = den === 0 ? 0 : num / den;
  const intercept = yMean - slope * xMean;
  return { slope, intercept };
}

export function projectForecast(historicalValues: number[], horizonMonths: number): number[] {
  const x = historicalValues.map((_, i) => i + 1);
  const { slope, intercept } = linearRegression(x, historicalValues);
  const forecast: number[] = [];
  for (let i = 1; i <= horizonMonths; i++) {
    const monthIndex = historicalValues.length + i;
    forecast.push(Math.max(0, slope * monthIndex + intercept));
  }
  return forecast;
}

export class InsufficientDataError extends Error {
  constructor() {
    super("INSUFFICIENT_DATA");
  }
}
