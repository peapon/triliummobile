/*
 * Worker-side half of the rawfile capability check.
 *
 * The client's storage layer needs two things a plain page cannot provide: a Worker (the OPFS
 * SAH-Pool VFS is worker-only because `createSyncAccessHandle` is) and an origin OPFS will accept.
 * A `resource://rawfile` page satisfies neither on paper, so this measures it instead of assuming.
 *
 * Deliberately plain JavaScript with no imports: if a module worker cannot be constructed from this
 * origin, the classic form is the control that says whether the failure is the origin or the module
 * type.
 */

async function report() {
  const result = {
    workerAlive: true,
    hasCreateSyncAccessHandle:
      typeof FileSystemFileHandle !== "undefined"
        ? typeof FileSystemFileHandle.prototype.createSyncAccessHandle
        : "no FileSystemFileHandle",
    hasGetDirectory: !!(self.navigator?.storage?.getDirectory),
    secureContext: self.isSecureContext,
    origin: self.location.origin
  };

  try {
    const root = await navigator.storage.getDirectory();
    result.getDirectory = "ok";

    const handle = await root.getFileHandle("probe-worker.txt", { create: true });

    // The real question: can this worker take a *synchronous* handle? Without it sqlite-wasm's
    // SAH-Pool VFS cannot open at all, and the client would need a different storage driver.
    if (typeof handle.createSyncAccessHandle === "function") {
      const sync = await handle.createSyncAccessHandle();
      sync.write(new TextEncoder().encode("hello"), { at: 0 });
      sync.flush();
      sync.close();
      result.createSyncAccessHandle = "ok";
    } else {
      result.createSyncAccessHandle = "missing";
    }

    const writable = await handle.createWritable();
    await writable.write("async-write-ok");
    await writable.close();
    result.asyncWritable = "ok";
  } catch (error) {
    result.error = String(error);
  }

  postMessage(result);
}

report();
