# Vendored runtime

- `litert.bundle.mjs`: [LiteRT.js](https://www.npmjs.com/package/@litertjs/core) 2.6.0 (`@litertjs/core` and `@litertjs/wasm-utils`), bundled into one ES module with esbuild. Copyright Google LLC, Apache License 2.0.
- `wasm/`: the matching LiteRT.js WebAssembly builds. `litert_wasm_internal` is used on browsers with relaxed SIMD, and `litert_wasm_compat_internal` on everything else.
