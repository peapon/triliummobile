/**
 * Byte-level helpers, implemented in pure JavaScript so that the sync engine behaves
 * byte-identically on Node, in a browser, and inside ArkWeb (HarmonyOS).
 *
 * Trilium's own server uses `node:crypto` with a *string* argument, which Node encodes as
 * UTF-8 — so `hash()` hashes UTF-8 bytes. The sync login HMAC, however, builds its key with
 * `Buffer.from(secret, "ascii")`, which is latin1 for encoding purposes. Both are reproduced
 * here exactly, and `crypto.spec.ts` cross-checks every primitive against `node:crypto`.
 */

/**
 * Encode a JS string to UTF-8 bytes, matching `Buffer.from(str, "utf8")`.
 *
 * Two passes rather than one growable array: a blob's UTF-8 form can be hundreds of megabytes, and
 * an intermediate `number[]` costs eight bytes per element. That representation is not merely slow —
 * it throws `RangeError: Invalid array length` on a large attachment.
 *
 * Lone surrogates become U+FFFD, which is what the WHATWG encoder and Node both do. Emitting the
 * surrogate's code point directly would produce bytes no other implementation agrees with, and the
 * blob id and every entity hash are derived from these bytes.
 */
export function utf8Encode(str: string): Uint8Array {
  let length = 0;

  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);

    if (code < 0x80) {
      length += 1;
    } else if (code < 0x800) {
      length += 2;
    } else if (code >= 0xd800 && code <= 0xdbff && isLowSurrogate(str.charCodeAt(i + 1))) {
      length += 4;
      i++;
    } else if (code >= 0xd800 && code <= 0xdfff) {
      length += 3; // a lone surrogate, written as U+FFFD
    } else {
      length += 3;
    }
  }

  const out = new Uint8Array(length);
  let at = 0;

  for (let i = 0; i < str.length; i++) {
    let code = str.charCodeAt(i);

    if (code >= 0xd800 && code <= 0xdbff && isLowSurrogate(str.charCodeAt(i + 1))) {
      code = 0x10000 + ((code - 0xd800) << 10) + (str.charCodeAt(i + 1) - 0xdc00);
      i++;
    } else if (code >= 0xd800 && code <= 0xdfff) {
      code = 0xfffd;
    }

    if (code < 0x80) {
      out[at++] = code;
    } else if (code < 0x800) {
      out[at++] = 0xc0 | (code >> 6);
      out[at++] = 0x80 | (code & 0x3f);
    } else if (code < 0x10000) {
      out[at++] = 0xe0 | (code >> 12);
      out[at++] = 0x80 | ((code >> 6) & 0x3f);
      out[at++] = 0x80 | (code & 0x3f);
    } else {
      out[at++] = 0xf0 | (code >> 18);
      out[at++] = 0x80 | ((code >> 12) & 0x3f);
      out[at++] = 0x80 | ((code >> 6) & 0x3f);
      out[at++] = 0x80 | (code & 0x3f);
    }
  }

  return out;
}

function isLowSurrogate(code: number): boolean {
  return code >= 0xdc00 && code <= 0xdfff;
}

/**
 * Encode a JS string the way `Buffer.from(str, "ascii")` does when *encoding* a string:
 * one byte per UTF-16 code unit, truncated to its low 8 bits (i.e. latin1).
 */
export function asciiEncode(str: string): Uint8Array {
  const out = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) {
    out[i] = str.charCodeAt(i) & 0xff;
  }
  return out;
}

const B64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** Standard base64 with `=` padding, identical to `Buffer.toString("base64")`. */
export function base64Encode(bytes: Uint8Array): string {
  const parts: string[] = [];

  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i]!;
    const b1 = i + 1 < bytes.length ? bytes[i + 1]! : 0;
    const b2 = i + 2 < bytes.length ? bytes[i + 2]! : 0;

    parts.push(
      B64_ALPHABET[b0 >> 2]!,
      B64_ALPHABET[((b0 & 0x03) << 4) | (b1 >> 4)]!
    );

    if (i + 1 < bytes.length) {
      parts.push(B64_ALPHABET[((b1 & 0x0f) << 2) | (b2 >> 6)]!);
    } else {
      parts.push("=");
    }

    if (i + 2 < bytes.length) {
      parts.push(B64_ALPHABET[b2 & 0x3f]!);
    } else {
      parts.push("=");
    }
  }

  return parts.join("");
}

export function base64Decode(base64: string): Uint8Array {
  const clean = base64.replace(/[\r\n\s]/g, "");
  const out: number[] = [];

  for (let i = 0; i < clean.length; i += 4) {
    const c0 = B64_ALPHABET.indexOf(clean[i] ?? "=");
    const c1 = B64_ALPHABET.indexOf(clean[i + 1] ?? "=");
    const c2 = clean[i + 2] === "=" || clean[i + 2] === undefined ? -1 : B64_ALPHABET.indexOf(clean[i + 2]!);
    const c3 = clean[i + 3] === "=" || clean[i + 3] === undefined ? -1 : B64_ALPHABET.indexOf(clean[i + 3]!);

    if (c0 < 0 || c1 < 0) {
      throw new Error("Invalid base64 input");
    }

    out.push(((c0 << 2) | (c1 >> 4)) & 0xff);
    if (c2 >= 0) out.push(((c1 << 4) | (c2 >> 2)) & 0xff);
    if (c3 >= 0) out.push(((c2 << 6) | c3) & 0xff);
  }

  return Uint8Array.from(out);
}

export function concatBytes(...chunks: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const c of chunks) total += c.length;
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}
