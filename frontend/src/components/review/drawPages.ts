// The printed resume's pages as pictures, drawn once while the AI reads: the
// page being read shows one, and the result marks them all. Whoever draws them
// frees them (freePages) once they're no longer shown.

export interface DrawnPage {
  url: string
  /** The page's size, in PDF points, which the marks and the gaze are measured in. */
  width: number
  height: number
}

// How wide each page is drawn, in pixels: about twice as wide as it's shown, for high-density screens.
const DRAWN_WIDTH = 1400

/**
 * Every page of `pdf`, handed to `onPage` as each is drawn, or null if they
 * can't be drawn (a browser that can't make the picture, say). Stops between
 * pages once `signal` aborts, as when the review is left, and frees what it drew.
 */
export async function drawPages(
  pdf: Uint8Array,
  signal: AbortSignal,
  onPage?: (page: DrawnPage, index: number) => void,
): Promise<DrawnPage[] | null> {
  const drawn: DrawnPage[] = []
  try {
    const { loadPdfjs } = await import("@/lib/import/open")
    const { getDocument } = await loadPdfjs()
    // A copy, as pdf.js takes the bytes it's given over to its worker.
    const task = getDocument({ data: pdf.slice(), isEvalSupported: false })
    try {
      const doc = await task.promise
      for (let number = 1; number <= doc.numPages; number++) {
        signal.throwIfAborted()
        const page = await doc.getPage(number)
        const size = page.getViewport({ scale: 1 })
        const viewport = page.getViewport({ scale: DRAWN_WIDTH / size.width })
        const canvas = document.createElement("canvas")
        canvas.width = Math.round(viewport.width)
        canvas.height = Math.round(viewport.height)
        const context = canvas.getContext("2d")
        if (!context) throw new Error("No canvas to draw on")
        await page.render({ canvasContext: context, viewport }).promise
        const picture = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.9))
        if (!picture) throw new Error("The page couldn't be drawn")
        signal.throwIfAborted()
        const drawnPage = { url: URL.createObjectURL(picture), width: size.width, height: size.height }
        drawn.push(drawnPage)
        onPage?.(drawnPage, number - 1)
      }
    } finally {
      void task.destroy()
    }
    return drawn
  } catch (error) {
    if (!signal.aborted) console.warn("The review couldn't draw the resume:", error)
    freePages(drawn)
    return null
  }
}

export function freePages(pages: readonly DrawnPage[] | null) {
  for (const { url } of pages ?? []) URL.revokeObjectURL(url)
}
