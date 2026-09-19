const UNIT_MS = { h: 3_600_000, m: 60_000, s: 1_000 } as const;

// One h/m/s component per match, with its own leading whitespace folded in
// (so "1h 30m" and "1 h 30 m" both read as separators, never as digits
// fused together). A string is only a valid duration if these matches, laid
// end to end, account for every character of the trimmed input — that's
// what rules out bare numbers, stray text, and gaps.
const COMPONENT = /\s*(?<amount>\d+)\s*(?<unit>[hms])/g;

export function parseDuration(input: string): number {
  const trimmed = input.trim();
  const matches = [...trimmed.matchAll(COMPONENT)];

  const { totalMs, consumed } = matches.reduce(
    (acc, { 0: raw, groups }) => ({
      totalMs: acc.totalMs + Number(groups!.amount) * UNIT_MS[groups!.unit as keyof typeof UNIT_MS],
      consumed: acc.consumed + raw.length,
    }),
    { totalMs: 0, consumed: 0 },
  );

  if (matches.length === 0 || consumed !== trimmed.length) {
    throw new Error(`Invalid duration string: ${JSON.stringify(input)}`);
  }

  return totalMs;
}
