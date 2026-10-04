/**
 * The exact cryptographic primitives Trilium's sync protocol depends on.
 *
 * Every function here must match the reference server byte-for-byte. The rules were read from
 * the upstream sources rather than inferred, and `crypto.spec.ts` cross-checks each one against
 * `node:crypto`:
 *
 * | Function          | Upstream source                                             |
 * |-------------------|-------------------------------------------------------------|
 * | `hash`            | `packages/trilium-core/src/services/utils/index.ts:27`       |
 * | `hashedBlobId`    | `packages/trilium-core/src/services/utils/index.ts:61`       |
 * | HMAC login        | `apps/server/src/crypto_provider.ts:29` (`hmac`)             |
 * | content sectors   | `packages/trilium-core/src/services/content_hash.ts:75-95`   |
 */

import { asciiEncode, base64Encode, base64Decode, concatBytes, utf8Encode } from "./bytes.js";
import { sha1Bytes, sha256Bytes, sha512Bytes } from "./digest.js";

export { asciiEncode, base64Decode, base64Encode, concatBytes, utf8Encode };
export { sha1Bytes, sha256Bytes, sha512Bytes };

/**
 * `utils.hash()` — SHA-1 over the UTF-8 bytes of the NFC-normalised input, base64-encoded.
 *
 * The `.normalize()` call is load-bearing: without it a note title containing a decomposed
 * accented character hashes differently from the server's, and the content-hash check never
 * converges.
 */
export function trilogyHash(text: string): string {
  return base64Encode(sha1Bytes(utf8Encode(text.normalize())));
}

/**
 * `hashedBlobId()` — base64(SHA-512(content)) with `+`/`/` replaced and truncated to 20 chars.
 * The replacements keep the id safe to embed in URLs and note ids.
 */
export function hashedBlobId(content: string | Uint8Array): string {
  const bytes = typeof content === "string" ? utf8Encode(content) : content;
  const base64Hash = base64Encode(sha512Bytes(bytes));
  return base64Hash.replaceAll("+", "X").replaceAll("/", "Y").substring(0, 20);
}

const HMAC_BLOCK_SIZE = 64;

/**
 * HMAC-SHA-256, returning base64 — matching `NodejsCryptoProvider.hmac()`.
 *
 * The key is encoded as **latin1**, not UTF-8, because upstream builds it with
 * `Buffer.from(secret.toString(), "ascii")`. For the base64-shaped `documentSecret` the two
 * encodings agree, but they diverge for any secret containing non-ASCII characters, so the
 * distinction is preserved rather than assumed away.
 */
export function hmacSha256Base64(secret: string, value: string): string {
  let key = asciiEncode(secret);

  if (key.length > HMAC_BLOCK_SIZE) {
    key = sha256Bytes(key);
  }

  const paddedKey = new Uint8Array(HMAC_BLOCK_SIZE);
  paddedKey.set(key);

  const innerPad = new Uint8Array(HMAC_BLOCK_SIZE);
  const outerPad = new Uint8Array(HMAC_BLOCK_SIZE);
  for (let i = 0; i < HMAC_BLOCK_SIZE; i++) {
    innerPad[i] = paddedKey[i]! ^ 0x36;
    outerPad[i] = paddedKey[i]! ^ 0x5c;
  }

  const inner = sha256Bytes(concatBytes(innerPad, utf8Encode(value)));
  return base64Encode(sha256Bytes(concatBytes(outerPad, inner)));
}
