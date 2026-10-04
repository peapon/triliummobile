import { createHash, createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  asciiEncode,
  base64Decode,
  base64Encode,
  hashedBlobId,
  hmacSha256Base64,
  sha1Bytes,
  sha256Bytes,
  sha512Bytes,
  trilogyHash,
  utf8Encode
} from "./index.js";

/**
 * Every primitive is cross-checked against `node:crypto`, which is what the reference Trilium
 * server actually uses. If these pass, the pure-JS implementations are byte-identical to the
 * server's — which is the precondition for the content-hash check ever converging.
 */

const nodeSha = (algo: "sha1" | "sha256" | "sha512", input: Uint8Array) =>
  new Uint8Array(createHash(algo).update(input).digest());

describe("byte helpers", () => {
  it("encodes UTF-8 identically to Buffer", () => {
    const samples = [
      "",
      "hello",
      "Trilium 笔记",
      "emoji 🎉 𝄞",
      "mixed ünïcödé ÿ",
      "\u00e9", // precomposed e-acute
      "e\u0301", // decomposed e + combining acute
      // Lone surrogates must become U+FFFD, as the WHATWG encoder and Node both do. Emitting the
      // code point directly would produce bytes no other implementation agrees with — and every blob
      // id and entity hash is derived from these bytes.
      "\ud800",
      "a\ud800b",
      "\udc00",
      "\ud83c\udf89", // a well-formed surrogate pair
      "\ud83c" // half of a pair, at the end
    ];

    for (const s of samples) {
      expect(Array.from(utf8Encode(s))).toEqual(Array.from(Buffer.from(s, "utf8")));
    }
  });

  it("encodes latin1/ascii identically to Buffer 'ascii'", () => {
    const samples = ["", "abc", "A-Za-z0-9+/=", "Ünïcode", "\u00ff\u0080"];
    for (const s of samples) {
      // Buffer.from(s, "ascii") truncates each code unit to its low 8 bits.
      expect(Array.from(asciiEncode(s))).toEqual(Array.from(Buffer.from(s, "ascii")));
    }
  });

  it("round-trips base64", () => {
    for (let len = 0; len < 70; len++) {
      const bytes = Uint8Array.from({ length: len }, (_, i) => (i * 37 + len) & 0xff);
      const encoded = base64Encode(bytes);
      expect(encoded).toBe(Buffer.from(bytes).toString("base64"));
      expect(Array.from(base64Decode(encoded))).toEqual(Array.from(bytes));
    }
  });
});

describe("digests", () => {
  it("matches node:crypto for many lengths (padding edge cases)", () => {
    // Lengths around the 55/56/63/64/65 and 111/128 boundaries exercise every padding branch.
    const lengths = [0, 1, 2, 3, 55, 56, 57, 63, 64, 65, 111, 112, 119, 120, 127, 128, 129, 200, 1000];

    for (const len of lengths) {
      const input = Uint8Array.from({ length: len }, (_, i) => (i * 131 + 7) & 0xff);

      expect(Array.from(sha1Bytes(input))).toEqual(Array.from(nodeSha("sha1", input)));
      expect(Array.from(sha256Bytes(input))).toEqual(Array.from(nodeSha("sha256", input)));
      expect(Array.from(sha512Bytes(input))).toEqual(Array.from(nodeSha("sha512", input)));
    }
  });

  it("matches the published SHA test vectors", () => {
    expect(base64Encode(sha1Bytes(utf8Encode("abc")))).toBe("qZk+NkcGgWq6PiVxeFDCbJzQ2J0=");
    expect(base64Encode(sha256Bytes(utf8Encode("abc")))).toBe(
      "ungWv48Bz+pBQUDeXa4iI7ADYaOWF3qctBD/YfIAFa0="
    );
    expect(base64Encode(sha512Bytes(utf8Encode("abc")))).toMatch(/^3a81oZNherrMQXNJriBB/);
  });
});

describe("trilium hash", () => {
  it("matches SHA-1(base64) of the NFC-normalised UTF-8 string", () => {
    const samples = [
      "|noteId|Title|false|text|text/html|abc",
      "中文标题|mixed|é",
      "e\u0301",
      ""
    ];

    for (const s of samples) {
      const expected = createHash("sha1").update(s.normalize()).digest("base64");
      expect(trilogyHash(s)).toBe(expected);
    }
  });

  it("normalises to NFC, so composed and decomposed forms collide", () => {
    // Upstream calls text.normalize() with no argument, which is NFC.
    expect(trilogyHash("e\u0301")).toBe(trilogyHash("\u00e9"));
  });
});

describe("hmac login hash", () => {
  it("matches node:crypto HMAC-SHA256 with an ascii key", () => {
    const secrets = ["fI+iWkB61IBz5plJFAFeJQ==", "short", "x".repeat(200)];
    const values = ["2026-10-04 15:06:12.885", "", "value with spaces"];

    for (const secret of secrets) {
      for (const value of values) {
        const expected = createHmac("sha256", Buffer.from(secret, "ascii"))
          .update(value)
          .digest("base64");
        expect(hmacSha256Base64(secret, value)).toBe(expected);
      }
    }
  });
});

describe("blob ids", () => {
  it("matches base64(SHA-512) with + and / replaced, truncated to 20", () => {
    for (const content of ["", "hello world", "笔记内容", "x".repeat(5000)]) {
      const raw = createHash("sha512").update(Buffer.from(content, "utf8")).digest("base64");
      const expected = raw.replaceAll("+", "X").replaceAll("/", "Y").substring(0, 20);
      expect(hashedBlobId(content)).toBe(expected);
      expect(hashedBlobId(content)).toHaveLength(20);
    }
  });
});
