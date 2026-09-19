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
 * Decodes a single key or value: "+" becomes a space, then the rest is
 * percent-decoded. Falls back to the "+"-decoded (but not percent-decoded)
 * string if the percent-encoding itself is malformed, so a bad sequence
 * degrades instead of throwing.
 */
function decodeComponent(raw: string): string {
  const withSpaces = raw.replace(/\+/g, ' ');
  try {
    return decodeURIComponent(withSpaces);
  } catch {
    return withSpaces;
  }
}
