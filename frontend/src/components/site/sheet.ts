/**
 * The sheet a page that's mostly words (the terms, how the templates read,
 * the 404) is written on, inside a PAPER_FRAME, on a `desk desk-bright`: the
 * sheet the templates and the dashboard are on (CARD_SHEET), with room round
 * the words for reading. Pages add their own layout (flex, gaps) to it.
 */
export const SHEET = "paper paper-sky flex-1 px-5 pb-12 pt-8 md:px-10 md:pb-14 md:pt-10"

/** A part of a page that's mostly words, as PromiseSection lays one out: its HEADING beside its words, under a rule. */
export const SECTION = "grid gap-6 border-t border-ink pt-6 md:grid-cols-3 md:gap-12"
export const HEADING = "font-serif text-[28px] leading-[1.15] tracking-[-0.02em] md:text-[32px]"

/** A link inside the sentences of a page that's mostly words. */
export const TEXT_LINK = "text-ink underline underline-offset-4 hover:decoration-2"

/**
 * The sheet the dashboard and the templates pages are on, inside a
 * PAPER_FRAME: their parts in a column, under a row of buttons. The sky shows
 * through it a little (paper-sky), so the white cards on it stand out.
 */
export const CARD_SHEET = "paper paper-sky flex flex-1 flex-col px-4 pb-10 pt-4 sm:px-6 sm:pt-6 md:px-9 md:pb-12 md:pt-[30px]"

/** The frosted pill atop a CARD_SHEET that says how many are on it, as "3 resumes · Saved in this browser". */
export const COUNT_BADGE =
  "inline-flex h-[34px] min-w-0 items-center gap-2 rounded-full bg-white/70 px-4 text-[14px] text-[#3a3e46] shadow-[inset_0_0_0_1px_rgb(255_255_255/0.9),0_1px_2px_rgb(17_19_24/0.06)]"

/**
 * A page that's one white sheet in a frosted frame over the sky (.paper-frame
 * and .paper in styles/sheet.css), as the dashboard is. The frame is at least
 * as tall as the screen leaves under the header (SiteHeader's strip is 76px,
 * 84px from md), less a margin of sky under it; the sheet, a `paper` in it,
 * fills it.
 */
export const PAPER_FRAME =
  "paper-frame mx-auto mb-6 mt-3 flex min-h-[calc(100svh-112px)] w-[calc(100%-1rem)] max-w-[1392px] flex-col sm:w-[calc(100%-3rem)] md:min-h-[calc(100svh-120px)]"
