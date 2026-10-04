/**
 * Byte-level helpers, implemented in pure JavaScript so that the sync engine behaves
 * byte-identically on Node, in a browser, and inside ArkWeb (HarmonyOS).
 *
 * Trilium's own server uses `node:crypto` with a *string* argument, which Node encodes as
 * UTF-8 — so `hash()` hashes UTF-8 bytes. The sync login HMAC, however, builds its key with
 * `Buffer.from(secret, "ascii")`, which is latin1 for encoding purposes. Both are reproduced
 * here exactly, and `crypto.spec.ts` cross-checks every primitive against `node:crypto`.
 */

/** Encode a JS string to UTF-8 bytes, with lone surrogates replaced (WHATWG behaviour). */
export function utf8Encode(str: string): Uint8Array {
  const out: number[] = [];

  for (let i = 0; i < str.length; i++) {
    let code = str.charCodeAt(i);

    if (code >= 0xd800 && code <= 0xdbff && i + 1 < str.length) {
      const next = str.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        code = 0x10000 + ((code - 0xd800) << 10) + (next - 0xdc00);
        i++;
      }
    }

    if (code < 0x80) {
      out.push(code);
    } else if (code < 0x800) {
      out.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code < 0x10000) {
      out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    } else {
      out.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f)
      );
    }
  }

  return Uint8Array.from(out);
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
