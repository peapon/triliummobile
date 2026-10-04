/**
 * Vite handles CSS imports at build time; TypeScript only needs to know the module exists.
 * `vite/client` is deliberately not pulled in through `compilerOptions.types`, because that entry
 * resolves as a `@types` package and fails under `moduleResolution: "bundler"`.
 */
declare module "*.css";
