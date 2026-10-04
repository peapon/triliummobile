/**
 * The native half of the API bridge.
 *
 * Two measured facts force this to exist, and both were established on a real HarmonyOS device
 * rather than inferred:
 *
 * 1. **The Trilium server sends `Cross-Origin-Resource-Policy: same-origin` and no CORS headers.**
 *    A page on any other origin cannot read its API — a control request to a CORS-permitting host on
 *    the same LAN and port scheme returned 200, so the block is CORS and nothing else. See ADR D9.
 * 2. **`onInterceptRequest` is synchronous**, so it cannot perform a network round trip. Static assets
 *    are served through it; the API goes through this `javaScriptProxy` object instead, whose async
 *    methods the page can await.
 *
 * The cookie jar lives here rather than in the page. `Set-Cookie` is consumed natively and never
 * forwarded, so session handling has exactly one owner.
 */

import { util } from "@kit.ArkTS";
import { BusinessError } from "@kit.BasicServicesKit";
import { hilog } from "@kit.PerformanceAnalysisKit";
import { http } from "@kit.NetworkKit";

/** Shape handed back to the page. `body` is base64 so binary payloads survive the bridge. */
interface BridgeResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
  error?: string;
}

const DOMAIN = 0x0000;
const TAG = "TriliumBridge";

export class ApiProxy {
  /** name -> value, exactly as the server set them. */
  private cookies: Map<string, string> = new Map<string, string>();
  private readonly base64: util.Base64Helper = new util.Base64Helper();

  /**
   * Perform one HTTP request on the page's behalf.
   *
   * Called from JavaScript as `triliumNative.request(method, url, headersJson, bodyBase64)`. It must
   * never throw across the bridge: a rejected promise surfaces in the page as an opaque error, so
   * every failure is returned as a value with `error` set.
   */
  async request(
    method: string,
    url: string,
    headersJson: string,
    bodyBase64: string
  ): Promise<string> {
    try {
      const headers: Record<string, string> = this.parseHeaders(headersJson);

      if (this.cookies.size > 0) {
        headers["Cookie"] = this.cookieHeader();
      }

      const options: http.HttpRequestOptions = {
        method: method as http.RequestMethod,
        header: headers,
        expectDataType: http.HttpDataType.ARRAY_BUFFER,
        connectTimeout: 30000,
        // A first sync of a large vault is one long request; the page's own timeout is the outer bound.
        readTimeout: 120000,
        usingCache: false
      };

      if (bodyBase64.length > 0) {
        // An exact ArrayBuffer, not the decoded view: `extraData` accepts `string | Object |
        // ArrayBuffer`, and handing it a Uint8Array whose backing buffer is larger than the view
        // sends whatever trailing bytes happen to be there.
        const decoded: Uint8Array = this.base64.decodeSync(bodyBase64);
        options.extraData = decoded.buffer.slice(
          decoded.byteOffset,
          decoded.byteOffset + decoded.byteLength
        );
      }

      hilog.info(
        DOMAIN,
        TAG,
        "-> %{public}s %{public}s body=%{public}d contentType=%{public}s cookie=%{public}s",
        method,
        url,
        bodyBase64.length,
        headers["Content-Type"] ?? headers["content-type"] ?? "(none)",
        this.cookies.size > 0 ? "yes" : "no"
      );

      const response = await http.createHttp().request(url, options);
      this.captureCookies(response.header);

      const bytes = this.toBytes(response.result);
      const result: BridgeResponse = {
        status: response.responseCode,
        // `Set-Cookie` is deliberately withheld: the jar here is authoritative.
        headers: this.responseHeaders(response.header),
        body: bytes.byteLength > 0 ? this.base64.encodeToStringSync(bytes) : ""
      };

      return JSON.stringify(result);
    } catch (error) {
      const failure: BridgeResponse = {
        status: 0,
        headers: {},
        body: "",
        error: `${(error as BusinessError)?.message ?? error}`
      };
      return JSON.stringify(failure);
    }
  }

  /** Drop the session, so reconfiguring the server does not carry the old one over. */
  reset(): void {
    this.cookies.clear();
  }

  private cookieHeader(): string {
    const parts: string[] = [];
    this.cookies.forEach((value: string, name: string) => parts.push(`${name}=${value}`));
    return parts.join("; ");
  }

  private parseHeaders(json: string): Record<string, string> {
    const headers: Record<string, string> = {};
    if (!json || json.length === 0) return headers;

    try {
      const parsed = JSON.parse(json) as Record<string, string>;
      for (const key of Object.keys(parsed)) {
        headers[key] = parsed[key];
      }
    } catch (error) {
      // A malformed header block is not worth failing the request over; the server will answer
      // whatever it answers without them.
    }
    return headers;
  }

  private responseHeaders(header: Object): Record<string, string> {
    const result: Record<string, string> = {};
    if (!header) return result;

    const source = header as Record<string, Object>;
    for (const key of Object.keys(source)) {
      const lower = key.toLowerCase();
      if (lower === "set-cookie" || lower === "content-length") continue;
      result[key] = `${source[key]}`;
    }
    return result;
  }

  /**
   * Fold `Set-Cookie` into the jar.
   *
   * A response may carry several cookies, and Node hands them back either as one comma-joined string
   * or as an array. Splitting on commas naively breaks on an `Expires` date, so the split only
   * happens at a comma that is followed by something that looks like a new cookie name.
   */
  private captureCookies(header: Object): void {
    if (!header) return;

    const source = header as Record<string, Object>;
    let raw: string[] = [];

    for (const key of Object.keys(source)) {
      if (key.toLowerCase() !== "set-cookie") continue;

      const value = source[key];
      raw = Array.isArray(value) ? (value as string[]) : `${value}`.split(/,(?=[^;=]+=)/);
    }

    for (const cookie of raw) {
      const pair = cookie.split(";")[0].trim();
      const eq = pair.indexOf("=");
      if (eq <= 0) continue;

      const name = pair.substring(0, eq).trim();
      const value = pair.substring(eq + 1).trim();
      if (value.length === 0) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
  }

  private toBytes(result: Object): Uint8Array {
    if (result instanceof ArrayBuffer) return new Uint8Array(result);
    if (result instanceof Uint8Array) return result;
    if (typeof result === "string") return new util.TextEncoder().encodeInto(result);
    return new Uint8Array(0);
  }
}
