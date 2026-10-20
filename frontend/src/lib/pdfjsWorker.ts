// pdf.js's worker, bundled with the app, for the preview (react-pdf) and for
// opening and checking PDFs (lib/import/open.ts) alike. pdf.js refuses a
// worker from another version, so pdfjs-dist is pinned to the version
// react-pdf is built on, and both use this one copy (pdfjsVersion.test.ts).
export const PDFJS_WORKER_URL = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString()
