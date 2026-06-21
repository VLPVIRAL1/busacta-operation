# PDF Worker — local import & version safety

We render PDFs in-browser with `react-pdf`, which is a thin wrapper around
`pdfjs-dist`. pdf.js ships its rendering engine as a **Web Worker** separate
from the main API bundle. The two halves must match exactly at runtime — a
worker built for pdf.js v5.7 cannot service requests from API v5.8.

## Why we import the worker locally

In `src/lib/pdf/pdf-worker.ts`:

```ts
import { pdfjs } from "react-pdf";
import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
```

- `pdfjs-dist/build/pdf.worker.min.mjs?url` — Vite's `?url` suffix copies
  the file from `node_modules` into the build output and gives us a hashed,
  fingerprinted URL (e.g. `/assets/pdf.worker.min-AbCd1234.mjs`).
- The asset ships with our deployment, so there is **no CDN dependency**
  and **no version skew** between API and worker. Both come from the same
  installed `pdfjs-dist` version.
- Works offline / behind firewalls / in the desktop Electron build.

Never replace this with a `cdnjs.cloudflare.com` or `unpkg` URL — that path
silently downgrades whenever npm bumps pdf.js underneath us and breaks
rendering with `UnknownErrorException: Worker version does not match`.

## Keeping it version-safe when deps update

1. `react-pdf` declares a peer/dependency range for `pdfjs-dist`. **Always
   bump both together** in the same PR:

   ```bash
   bun add react-pdf@latest pdfjs-dist@latest
   ```

   Do not pin them to independent versions. The `pdfjs` re-export from
   `react-pdf` and the worker file we import resolve from the same
   `node_modules/pdfjs-dist`, so installing matched versions keeps the API
   and worker locked together automatically.

2. After upgrading, manually open any PDF preview (e.g. a task attachment).
   The `ensurePdfWorker()` runtime check in `src/lib/pdf/pdf-worker.ts`
   will surface a clear "PDF engine failed to start" error in the UI if
   the worker asset URL changed or the import path moved.

3. If `pdfjs-dist` ever renames the worker entry (it has, historically:
   `pdf.worker.js` → `pdf.worker.min.js` → `pdf.worker.min.mjs`), update
   the `?url` import in `pdf-worker.ts` to match. Check the package's
   `build/` directory:

   ```bash
   ls node_modules/pdfjs-dist/build | grep worker
   ```

4. Do **not** import the worker from inside SSR/Worker runtime code paths.
   `pdf.worker.min.mjs` references `DOMMatrix` at module load, which only
   exists in the browser. All viewers in this repo lazy-load through the
   browser-only entry; preserve that pattern.

## Runtime diagnostics

`ensurePdfWorker()` issues a cached `HEAD` against the worker URL on first
use. Failures throw `PdfWorkerUnavailableError`, which the shared
`<PdfErrorState />` component renders with Retry / Open / Download
actions. If users report blank PDF panes, check the browser network tab
for a 404 on `/assets/pdf.worker.min-*.mjs` — that's the signal the build
didn't emit the worker (usually a Vite config regression).
