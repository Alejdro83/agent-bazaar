import crypto from 'crypto';

interface ValidatedUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
}

/**
 * Validates Telegram Mini App initData per official docs:
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 *
 * 1. Parse initData string into key-value pairs
 * 2. Sort alphabetically by key
 * 3. Create data-check-string (key=value pairs joined by newline)
 * 4. HMAC-SHA256 with secret key from bot token
 * 5. Compare hash
 */
export function validateInitData(
  initData: string,
  botToken: string
): { valid: boolean; user?: ValidatedUser; error?: string } {
  if (!initData || !botToken) {
    return { valid: false, error: 'Missing initData or botToken' };
  }

  // Parse initData string
  const params = new URLSearchParams(initData);
  const data: Record<string, string> = {};
  for (const [key, value] of params.entries()) {
    data[key] = value;
  }

  // Extract and remove hash
  const hash = data.hash;
  if (!hash) {
    return { valid: false, error: 'No hash in initData' };
  }
  delete data.hash;

  // Check auth_date (not older than 24h)
  const authDate = parseInt(data.auth_date, 10);
  const now = Math.floor(Date.now() / 1000);
  if (now - authDate > 86400) {
    return { valid: false, error: 'initData expired (>24h old)' };
  }

  // Sort keys and build data-check-string
  const sortedKeys = Object.keys(data).sort();
  const dataCheckString = sortedKeys
    .map((key) => `${key}=${data[key]}`)
    .join('\n');

  // Compute HMAC-SHA256
  const secretKey = crypto
    .createHmac('sha256', 'WebAppData')
    .update(botToken)
    .digest();

  const computedHash = crypto
    .createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex');

  // Compare using a constant-time check — a plain `!==` leaks timing
  // information proportional to how many leading hex chars match, which an
  // attacker could use to forge a valid hash byte-by-byte.
  const computedHashBuffer = Buffer.from(computedHash, 'hex');
  const hashBuffer = Buffer.from(hash, 'hex');
  if (
    hashBuffer.length !== computedHashBuffer.length ||
    !crypto.timingSafeEqual(computedHashBuffer, hashBuffer)
  ) {
    return { valid: false, error: 'Invalid signature' };
  }

  // Parse user data
  let user: ValidatedUser | undefined;
  if (data.user) {
    try {
      user = JSON.parse(data.user);
    } catch {
      return { valid: false, error: 'Invalid user data' };
    }
  }

  return { valid: true, user };
}

/**
 * Parse initData string without validation (for client-side display only)
 */
export function parseInitDataUnsafe(initData: string): {
  user?: ValidatedUser;
  auth_date?: number;
  start_param?: string;
} {
  const params = new URLSearchParams(initData);
  const data: Record<string, string> = {};
  for (const [key, value] of params.entries()) {
    data[key] = value;
  }

  let user: ValidatedUser | undefined;
  if (data.user) {
    try {
      user = JSON.parse(data.user);
    } catch {
      // ignore
    }
  }

  return {
    user,
    auth_date: data.auth_date ? parseInt(data.auth_date, 10) : undefined,
    start_param: data.start_param,
  };
}
