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
  /** Configure from a known document secret instead of a password. */
  readonly VITE_E2E_SECRET?: string;
  /** When set, the test build captures a note with this title and syncs it. */
  readonly VITE_E2E_CAPTURE?: string;
  /** When set, the test build edits a note matching this text and syncs it. */
  readonly VITE_E2E_EDIT?: string;
  /** A second vault, to exercise the switch-and-wipe path. */
  readonly VITE_E2E_SERVER_B?: string;
  readonly VITE_E2E_PASSWORD_B?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
