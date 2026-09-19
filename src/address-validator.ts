const DIRECTIONALS = new Set(["N", "S", "E", "W", "NE", "NW", "SE", "SW"]);
const STREET_NUMBER_PATTERN = /^\d+\s+[A-Za-z]/;
const ALLOWED_CHARS_PATTERN = /^[A-Za-z0-9\s#.,-]*$/;

export interface AddressResult {
  valid: boolean;
  normalized?: string;
  reason?: string;
}

function titleCaseWord(word: string): string {
  const upper = word.toUpperCase();
  if (DIRECTIONALS.has(upper)) {
    return upper;
  }
  const lower = word.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/**
 * Validates and normalizes a raw street-address line from a checkout form.
 */
export function validateAddress(raw: string): AddressResult {
  if (typeof raw !== "string") {
    return { valid: false, reason: "address is not a string" };
  }

  const trimmed = raw.trim();

  if (trimmed.length === 0) {
    return { valid: false, reason: "address is empty" };
  }

  if (!ALLOWED_CHARS_PATTERN.test(trimmed)) {
    return { valid: false, reason: "address contains unsupported characters" };
  }

  const collapsed = trimmed.replace(/\s+/g, " ");

  if (!STREET_NUMBER_PATTERN.test(collapsed)) {
    return { valid: false, reason: "address is missing a street number" };
  }

  const normalized = collapsed.split(" ").map(titleCaseWord).join(" ");

  return { valid: true, normalized };
}
