// react-pdf, with pdf.js, which draw the preview. PdfPreview loads this once
// the editor opens, rather than with the page, and keeps their styles (see there).

import { pdfjs } from "react-pdf"
import { PDFJS_WORKER_URL } from "@/lib/pdfjsWorker"

// Loading react-pdf points pdf.js at a worker file of its own. The checker
// uses the same copy of pdf.js (lib/import/open.ts) and may have loaded it
// first, so the app's worker is set back here, before other code can run.
pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL

export { Document, Page, pdfjs } from "react-pdf"
