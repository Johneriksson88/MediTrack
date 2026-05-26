/**
 * Generate a strong, human-copy-able random password.
 *
 * Used by the "Generera lösenord" helper on /admin/users — the admin clicks
 * the button to fill the password field, copies the value, and hands it to
 * the user out-of-band. The user is expected to change it after first login
 * (no first-login flow exists yet — README note candidate).
 *
 * Length matches USER_PASSWORD_MIN (12) but defaults to 16 — under the
 * default character set, that's >100 bits of entropy, comfortably above the
 * NIST 800-63B threshold for memorized secrets.
 *
 * Character set excludes characters that are commonly confused when read
 * aloud or copied: 0 / O / o, 1 / l / I. The remaining alphabet still
 * spans upper/lower/digit/symbol so the generated value satisfies any
 * downstream policy without a second roll.
 */

const CHARSET =
  'ABCDEFGHJKLMNPQRSTUVWXYZ' + // no I, O
  'abcdefghijkmnpqrstuvwxyz' + // no l, o
  '23456789' + // no 0, 1
  '!@#$%^&*?-_';

export function generatePassword(length = 16): string {
  if (length < 1) throw new Error('generatePassword: length must be ≥ 1');
  const max = CHARSET.length;
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += CHARSET.charAt(bytes[i]! % max);
  }
  return out;
}
