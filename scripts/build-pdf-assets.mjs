// Self-host PDF.js assets: no third-party CDN or runtime script dependencies.
import { cp, mkdir } from "node:fs/promises";
const target = new URL("../dist/pdf-assets/", import.meta.url);
await mkdir(target, { recursive: true });
for (const directory of ["cmaps", "standard_fonts", "wasm"])
  await cp(
    new URL(`../node_modules/pdfjs-dist/${directory}/`, import.meta.url),
    new URL(`${directory}/`, target),
    { recursive: true },
  );
await cp(
  new URL("../node_modules/pdfjs-dist/LICENSE", import.meta.url),
  new URL("LICENSE", target),
);
