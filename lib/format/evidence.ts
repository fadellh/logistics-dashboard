// Small-sample caveat: CLAUDE.md's own guardrail ("no statistical significance claims...
// per-bucket sample size in single digits, e.g. per-carrier-per-month ≈ 3-4 orders") names
// single digits as the noise-risk zone. This surfaces that same threshold in the UI —
// showing the reader how thin a number's backing evidence is, instead of only avoiding
// claims about it in the answer text.
const SMALL_SAMPLE_THRESHOLD = 5;

export function isSmallSample(n: number): boolean {
  return n < SMALL_SAMPLE_THRESHOLD;
}
