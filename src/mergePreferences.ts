export type PreferenceObject = { [key: string]: unknown };

function isPlainObject(value: unknown): value is PreferenceObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Merges a user's saved preferences over a set of defaults.
 *
 * - A preference the user has set wins over the default.
 * - A preference the user has not set falls back to the default.
 * - Nested objects are merged key by key rather than replaced wholesale.
 * - A user preference explicitly set to `null` means "unset this" — it
 *   falls back to the default value for that key, just like a preference
 *   that was never set.
 * - Arrays are treated as plain values; they are copied over as-is and
 *   are never merged key by key.
 * - `defaults` is never modified; a new object is returned.
 */
export function mergePreferences(
  defaults: PreferenceObject,
  preferences: PreferenceObject
): PreferenceObject {
  const merged: PreferenceObject = { ...defaults };

  for (const key of Object.keys(preferences)) {
    const userValue = preferences[key];

    if (userValue === undefined) {
      continue;
    }

    const defaultValue = defaults[key];

    if (isPlainObject(userValue) && isPlainObject(defaultValue)) {
      merged[key] = mergePreferences(defaultValue, userValue);
    } else {
      merged[key] = userValue;
    }
  }

  return merged;
}
