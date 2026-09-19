/**
 * Parses the query-string portion of a URL into a plain object of keys to
 * values.
 *
 * A key that appears once maps to a string; a key that appears more than
 * once maps to an array of every value it was given, in the order they
 * appeared. A leading "?" is stripped if present. Both keys and values are
 * percent- and "+"-decoded.
 */
export function parseQueryString(input: string): Record<string, string | string[]> {
  const result: Record<string, string | string[]> = {};
  const stripped = input.startsWith('?') ? input.slice(1) : input;

  if (stripped.length === 0) {
    return result;
  }

  for (const pair of stripped.split('&')) {
    if (pair.length === 0) {
      continue;
    }

    const eqIndex = pair.indexOf('=');
    const rawKey = eqIndex === -1 ? pair : pair.slice(0, eqIndex);
    const rawValue = eqIndex === -1 ? '' : pair.slice(eqIndex + 1);

    const key = decodeComponent(rawKey);
    const value = decodeComponent(rawValue);

    const existing = result[key];
    if (existing === undefined) {
      result[key] = value;
    } else if (Array.isArray(existing)) {
      existing.push(value);
    } else {
      result[key] = [existing, value];
    }
  }

  return result;
}

/**
 * Decodes a single key or value: "+" becomes a space, then every run of
 * percent-escapes is decoded. A run that isn't valid percent-encoding (a
 * lone "%", a truncated escape, non-hex digits, or hex that isn't valid
 * UTF-8) is left exactly as written rather than throwing, so a stray "%"
 * elsewhere in the component doesn't stop unrelated valid escapes from
 * decoding.
 */
function decodeComponent(raw: string): string {
  const withSpaces = raw.replace(/\+/g, ' ');
  return withSpaces.replace(/(?:%[0-9A-Fa-f]{2})+/g, (run) => {
    try {
      return decodeURIComponent(run);
    } catch {
      return run;
    }
  });
}
