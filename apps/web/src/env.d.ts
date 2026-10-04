/**
 * Vite handles CSS imports at build time; TypeScript only needs to know the module exists.
 * `vite/client` is deliberately not pulled in through `compilerOptions.types`, because that entry
 * resolves as a `@types` package and fails under `moduleResolution: "bundler"`.
 */
declare module "*.css";

/**
 * Vite's `?url` suffix resolves a file to its emitted asset URL.
 *
 * Needed for the SQLite binary: the build content-hashes the filename, so the loader cannot be told
 * a fixed path — it has to be handed whatever URL the bundler produced.
 */
declare module "*?url" {
  const url: string;
  export default url;
}

/** Injected by Vite. Only the on-device end-to-end build sets these. */
interface ImportMetaEnv {
  /** When set, the app configures itself against this server on first boot. Test builds only. */
  readonly VITE_E2E_SERVER?: string;
  readonly VITE_E2E_PASSWORD?: string;
  /** When set, the test build captures a note with this title and syncs it. */
  readonly VITE_E2E_CAPTURE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
