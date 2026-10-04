import { describe, expect, it } from "vitest";

import { hmacSha256Base64 } from "../crypto/index.js";
import { SyncTransport, utcDateTimeStr } from "./transport.js";

/**
 * The login handshake's clock handling.
 *
 * The server refuses a sync login when the two clocks differ by more than five minutes, and this was
 * not a hypothetical: a HarmonyOS emulator ran an hour behind its host and every sync failed with
 * `Auth request time is out of sync`. The device's own `Date` header is the way out, so what is
 * pinned here is that the first refusal is used to correct the second attempt.
 */

const SECRET = "test-secret";

interface CapturedRequest {
  url: string;
  body: { timestamp: string; hash: string } | null;
}

/**
 * A fetch that refuses the first login for clock skew and accepts the second, exactly as a server
 * whose clock differs would.
 */
function skewingFetch(offsetMs: number, captured: CapturedRequest[]): typeof fetch {
  return (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = typeof input === "string" ? input : input.toString();
    const body = init.body ? JSON.parse(String(init.body)) : null;
    captured.push({ url, body });

    const headers = new Headers({ Date: new Date(Date.now() + offsetMs).toUTCString() });

    if (url.includes("/api/login/sync")) {
      // The server compares the timestamp against its own clock.
      const serverNow = Date.now() + offsetMs;
      const sent = Date.parse(body.timestamp);
      const skewed = Math.abs(sent - serverNow) > 5 * 60 * 1000;

      if (skewed) {
        headers.set("Content-Type", "application/json");
        return new Response(
          JSON.stringify({ message: "Auth request time is out of sync, please check that both client and server have correct time." }),
          { status: 401, headers }
        );
      }

      headers.set("Content-Type", "application/json");
      // Also prove the HMAC was built over the corrected timestamp, not the local one.
      const expected = hmacSha256Base64(SECRET, body.timestamp);
      if (body.hash !== expected) {
        return new Response(JSON.stringify({ message: "bad hash" }), { status: 400, headers });
      }

      return new Response(JSON.stringify({ instanceId: "serverinstid", maxEntityChangeId: 7 }), {
        status: 200,
        headers
      });
    }

    return new Response("{}", { status: 200, headers });
  }) as typeof fetch;
}

describe("sync login under clock skew", () => {
  it("corrects for a server clock an hour ahead and logs in on the retry", async () => {
    const captured: CapturedRequest[] = [];
    const transport = new SyncTransport({
      serverHost: "http://server",
      documentSecret: SECRET,
      syncVersion: 39,
      fetchImpl: skewingFetch(60 * 60 * 1000, captured)
    });

    const login = await transport.login();

    expect(login.instanceId).toBe("serverinstid");
    expect(login.maxEntityChangeId).toBe(7);

    const logins = captured.filter((request) => request.url.includes("/api/login/sync"));
    expect(logins).toHaveLength(2);

    // The second attempt's timestamp must be roughly the server's clock, not ours. Local time is an
    // hour behind, so an uncorrected retry would fail the same way.
    const second = Date.parse(logins[1]!.body!.timestamp);
    expect(second - Date.now()).toBeGreaterThan(55 * 60 * 1000);
  });

  it("handles a server clock behind ours too", async () => {
    const captured: CapturedRequest[] = [];
    const transport = new SyncTransport({
      serverHost: "http://server",
      documentSecret: SECRET,
      syncVersion: 39,
      fetchImpl: skewingFetch(-45 * 60 * 1000, captured)
    });

    await expect(transport.login()).resolves.toMatchObject({ instanceId: "serverinstid" });
  });

  it("logs in on the first attempt when the clocks agree", async () => {
    const captured: CapturedRequest[] = [];
    const transport = new SyncTransport({
      serverHost: "http://server",
      documentSecret: SECRET,
      syncVersion: 39,
      fetchImpl: skewingFetch(0, captured)
    });

    await transport.login();
    expect(captured.filter((request) => request.url.includes("/api/login/sync"))).toHaveLength(1);
  });

  it("does not retry a refusal that is not about the clock", async () => {
    const captured: CapturedRequest[] = [];
    const failing = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
      captured.push({
        url: typeof input === "string" ? input : input.toString(),
        body: init.body ? JSON.parse(String(init.body)) : null
      });

      return new Response(JSON.stringify({ message: "Sync login credentials are incorrect." }), {
        status: 400,
        headers: { "Content-Type": "application/json", Date: new Date().toUTCString() }
      });
    }) as typeof fetch;

    const transport = new SyncTransport({
      serverHost: "http://server",
      documentSecret: SECRET,
      syncVersion: 39,
      fetchImpl: failing
    });

    await expect(transport.login()).rejects.toThrow(/credentials are incorrect/);
    // A wrong documentSecret must not be retried: it will never succeed, and the retry would double
    // the failed login attempts the server rate-limits.
    expect(captured).toHaveLength(1);
  });
});

describe("utcDateTimeStr", () => {
  it("formats the way the server parses: space separator, millisecond precision, trailing Z", () => {
    const formatted = utcDateTimeStr(new Date(Date.UTC(2026, 9, 5, 1, 2, 3, 456)));
    expect(formatted).toBe("2026-10-05 01:02:03.456Z");
    expect(Date.parse(formatted)).toBe(Date.UTC(2026, 9, 5, 1, 2, 3, 456));
  });
});
