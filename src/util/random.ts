/**
 * Alphanumeric random ids, matching the shape upstream's `randomString()` produces.
 *
 * Entity ids, `changeId`s, `instanceId`s and `logMarkerId`s are all drawn from this. The alphabet is
 * deliberately the same 62 characters Trilium's `rand-token` uses, because ids travel to the server
 * and end up in the same columns as ids it generated.
 */

const ALPHABET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

export function randomString(length: number): string {
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);

  let out = "";
  for (const byte of bytes) {
    // 62 does not divide 256, so this is very slightly biased toward the first 8 characters.
    // Acceptable for identifiers; not used for anything cryptographic.
    out += ALPHABET[byte % ALPHABET.length];
  }
  return out;
}
