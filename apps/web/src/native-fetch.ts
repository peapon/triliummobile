/**
 * A `fetch` that goes out through the native shell.
 *
 * The page cannot reach the Trilium server itself. Its origin is `https://localhost` (a real origin
 * is what makes workers and OPFS available), and the server answers with
 * `Cross-Origin-Resource-Policy: same-origin` and no CORS headers, so a browser-level request is
 * refused — measured on the device, not assumed. `onInterceptRequest` cannot help either: it is
 * synchronous and cannot perform a network round trip.
 *
 * So the shell exposes `triliumNative.request(...)`, an async method on an injected object, and this
 * adapts it to the `fetch` shape the sync transport already accepts. Keeping the adaptation here
 * means the protocol code stays identical on every platform.
 */

/** Shape the ArkTS bridge returns. */
interface BridgeResponse {
  status: number;
  headers: Record<string, string>;
  /** base64, so binary payloads survive the JSON round trip across the bridge. */
  body: string;
  error?: string;
}

interface NativeBridge {
  request(method: string, url: string, headersJson: string, bodyBase64: string): Promise<string>;
  reset(): void;
}

/**
 * Wrap Android's bridge into the shape this file already expects.
 *
 * A `@JavascriptInterface` method cannot be asynchronous from JavaScript's side — it returns before
 * the request has been made — so the promise is assembled here instead: the call hands over an id,
 * and the shell calls `__triliumAndroidResolve` when the answer arrives. That keeps one contract for
 * both shells rather than a second code path in the protocol.
 */
function installAndroidBridge(): void {
  const globals = globalThis as unknown as {
    triliumAndroid?: {
      request(id: string, method: string, url: string, headersJson: string, bodyBase64: string): void;
      reset?(): void;
    };
    triliumNative?: NativeBridge;
    __triliumAndroidResolve?: (id: string, raw: string) => void;
  };

  const native = globals.triliumAndroid;
  if (!native || globals.triliumNative) return;

  let sequence = 0;
  const pending = new Map<string, (raw: string) => void>();

  globals.__triliumAndroidResolve = (id, raw) => {
    const settle = pending.get(id);
    if (settle) {
      pending.delete(id);
      settle(raw);
    }
  };

  globals.triliumNative = {
    request: (method, url, headersJson, bodyBase64) =>
      new Promise<string>((resolve) => {
        const id = `a${++sequence}`;
        pending.set(id, resolve);
        native.request(id, method, url, headersJson, bodyBase64);
      }),
    // The shell reports whether a back press has anywhere to go by calling the page instead, so
    // there is nothing to push; `reportBackEnabled` stays a no-op here.
    reset: () => native.reset?.()
  };
}

installAndroidBridge();

function getBridge(): NativeBridge | null {
  const candidate = (globalThis as unknown as { triliumNative?: NativeBridge }).triliumNative;
  return candidate && typeof candidate.request === "function" ? candidate : null;
}

/** True when running inside the HarmonyOS shell. */
/**
 * Tell the shell whether a back gesture has anywhere to go.
 *
 * The shell cannot work this out: the app is one document that navigates with `history.pushState`,
 * and a WebView's `accessBackward()` counts document navigations, not same-document entries. So
 * without this the shell answers "nowhere to go" on every press and the system exits the app.
 *
 * A no-op in a browser, where the platform's own back already drives `popstate`.
 */
export function reportBackEnabled(enabled: boolean): void {
  const native = (globalThis as unknown as { triliumNative?: { setBackEnabled?: (v: boolean) => void } })
    .triliumNative;
  native?.setBackEnabled?.(enabled);
}

export function hasNativeBridge(): boolean {
  return getBridge() !== null;
}

export function resetNativeBridge(): void {
  getBridge()?.reset();
}

// ------------------------------------------------------------------ base64

/**
 * Chunked, because `String.fromCharCode(...bytes)` overflows the argument list somewhere around a
 * hundred thousand elements — and a sync push routinely exceeds that.
 */
export function bytesToBase64(bytes: Uint8Array): string {
  let out = "";

  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    const slice = bytes.subarray(offset, offset + 0x8000);
    out += String.fromCharCode(...slice);
  }

  return btoa(out);
}

export function base64ToBytes(base64: string): Uint8Array {
  if (base64 === "") return new Uint8Array(0);

  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

// --------------------------------------------------------------------- fetch

async function bodyToBase64(body: BodyInit | null | undefined): Promise<string> {
  if (body === null || body === undefined) return "";

  if (typeof body === "string") return bytesToBase64(new TextEncoder().encode(body));
  if (body instanceof Uint8Array) return bytesToBase64(body);
  if (body instanceof ArrayBuffer) return bytesToBase64(new Uint8Array(body));
  if (ArrayBuffer.isView(body)) {
    return bytesToBase64(new Uint8Array(body.buffer, body.byteOffset, body.byteLength));
  }

  // A stream body cannot be forwarded without buffering it, and nothing in the protocol uses one.
  throw new Error("nativeFetch does not support stream request bodies");
}

/**
 * The `fetch` implementation handed to the sync transport.
 *
 * `Response` is rebuilt from the decoded body so callers see exactly what a normal fetch would give
 * them — including binary responses, which the protocol needs for `/open`.
 */
export async function nativeFetch(
  input: RequestInfo | URL,
  init: RequestInit = {}
): Promise<Response> {
  const bridge = getBridge();
  if (!bridge) throw new Error("native bridge is not available");

  const url =
    typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

  const method = (
    init.method ?? (typeof input === "object" && "method" in input ? input.method : "GET")
  ) as string;

  const headers: Record<string, string> = {};
  const source =
    init.headers ?? (typeof input === "object" && "headers" in input ? input.headers : undefined);

  if (source) {
    new Headers(source as HeadersInit).forEach((value, key) => {
      // The bridge owns the cookie jar; a page-supplied Cookie would be a second, stale owner.
      if (key.toLowerCase() !== "cookie") headers[key] = value;
    });
  }

  const bodyBase64 = await bodyToBase64(init.body);

  const raw = await bridge.request(method.toUpperCase(), url, JSON.stringify(headers), bodyBase64);
  const payload = JSON.parse(raw) as BridgeResponse;

  if (payload.status === 0) {
    throw new TypeError(payload.error ?? "native request failed");
  }

  const bytes = base64ToBytes(payload.body);

  // 204 and 304 must not carry a body, and the Response constructor rejects one.
  const body = payload.status === 204 || payload.status === 304 ? null : bytes;

  return new Response(body, {
    status: payload.status,
    statusText: "",
    headers: new Headers(payload.headers ?? {})
  });
}
