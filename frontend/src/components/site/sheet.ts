/**
 * A page's main part as one etched pane over the sky (.pane-etched in
 * styles/glass.css): centred, with the sky round it, and no wider than the
 * header's room. Pages add their own layout (flex, gaps) to it.
 */
export const SHEET =
  "pane-etched mx-auto mb-16 mt-2 w-[calc(100%-1.5rem)] max-w-[1360px] flex-1 px-5 pb-12 pt-8 md:mt-4 md:w-[calc(100%-5rem)] md:px-10 md:pb-14 md:pt-10"

/**
 * A page that's one white sheet in a frosted frame over the sky (.paper-frame
 * and .paper in styles/sheet.css), as the dashboard is. The frame is at least
 * as tall as the screen leaves under the header (SiteHeader's strip is 76px,
 * 84px from md), less a margin of sky under it; the sheet, a `paper` in it,
 * fills it.
 */
export const PAPER_FRAME =
  "paper-frame mx-auto mb-6 mt-3 flex min-h-[calc(100svh-112px)] w-[calc(100%-1rem)] max-w-[1392px] flex-col sm:w-[calc(100%-3rem)] md:min-h-[calc(100svh-120px)]"
