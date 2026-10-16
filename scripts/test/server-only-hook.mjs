// Test-only resolve hook. Next.js resolves `import "server-only"` itself
// (it is not an installed package here), so plain Node test runs would
// fail to resolve it. This maps it to an empty module for `npm test` only;
// the production build keeps Next's real client-import check.
import { registerHooks } from "node:module";

const EMPTY = new URL("./server-only-empty.cjs", import.meta.url).href;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") {
      return { url: EMPTY, format: "commonjs", shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});
