/**
 * Redacts values that look like API keys, passwords, or bearer tokens from a
 * text blob before it is written to a log.
 */

const REDACTED_MARKER = "REDACTED";
const VISIBLE_PREFIX_LENGTH = 4;
const FALLBACK_REDACTION = "[REDACTION_ERROR]";

interface SecretPattern {
  regex: RegExp;
}

function labeledSecretPattern(labels: string[]): RegExp {
  const labelGroup = labels.join("|");
  return new RegExp(
    `(?:${labelGroup})\\s*[:=]\\s*["']?([A-Za-z0-9\\-_.\\/+]{${VISIBLE_PREFIX_LENGTH},})["']?`,
    "gi"
  );
}

const PATTERNS: SecretPattern[] = [
  // Authorization: Bearer <token>
  { regex: /\bBearer\s+([A-Za-z0-9\-._~+/]+=*)/gi },
  // password / passwd / pwd = value
  { regex: labeledSecretPattern(["password", "passwd", "pwd"]) },
  // api_key / apikey / access_key / secret_key / client_secret / auth_token = value
  {
    regex: labeledSecretPattern([
      "api[_-]?key",
      "access[_-]?key",
      "secret[_-]?key",
      "client[_-]?secret",
      "auth[_-]?token",
    ]),
  },
  // AWS access key IDs
  { regex: /\b(AKIA[0-9A-Z]{16})\b/g },
  // GitHub personal/app/user/oauth/server tokens
  { regex: /\b(gh[opusr]_[A-Za-z0-9]{20,})\b/g },
  // Slack tokens
  { regex: /\b(xox[baprs]-[A-Za-z0-9-]{10,})\b/g },
  // Stripe secret keys
  { regex: /\b(sk_(?:live|test)_[A-Za-z0-9]{16,})\b/g },
  // JSON Web Tokens
  { regex: /\b(ey[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)\b/g },
];

function maskValue(value: string): string {
  const visible = value.slice(0, VISIBLE_PREFIX_LENGTH);
  return `${visible}***${REDACTED_MARKER}***`;
}

/**
 * Replaces anything that looks like a secret with a placeholder that keeps
 * the first few characters of the original value. Text with nothing
 * sensitive in it is returned unchanged. Never throws.
 */
export function redactSecrets(text: string): string {
  try {
    if (typeof text !== "string") {
      return text;
    }

    const seen = new Set<string>();
    let result = text;

    for (const { regex } of PATTERNS) {
      regex.lastIndex = 0;
      result = result.replace(regex, (match: string, secretValue: string) => {
        if (seen.has(secretValue)) {
          return match;
        }
        seen.add(secretValue);

        return match.replace(secretValue, maskValue(secretValue));
      });
    }

    return result;
  } catch {
    return FALLBACK_REDACTION;
  }
}
