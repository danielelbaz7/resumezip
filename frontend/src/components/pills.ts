// The site's buttons. On the pages about resumezip the main action is an ink
// pill and everything else an outline pill; the dashboard, the editor, the
// templates and their dialogs, on a white sheet, have their own (sheetPill, below).

const SHAPE =
  "inline-flex h-10 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-full px-[18px] text-[15px] font-medium tracking-[-0.01em] disabled:cursor-not-allowed disabled:opacity-50"
const PILL = `${SHAPE} transition-[background-color,box-shadow] duration-200 motion-reduce:transition-none`

/** The main action: it lifts under the pointer and sinks as it's pressed (ink-button, lift-button in globals.css). */
export const INK_PILL = `${SHAPE} ink-button lift-button`

export const OUTLINE_PILL = `${PILL} bg-sheet/70 text-ink ring-1 ring-inset ring-ink/15 hover:bg-sheet hover:ring-ink/40`

/** A main action on glass: ink glass, with a glossy lit top (ink-glass in globals.css). */
export const INK_GLASS_PILL = `${SHAPE} ink-glass`

/**
 * The glass bar a page's search and filters share (the templates page, Your
 * resumes): one pane, rounded at the ends on a wide screen's single line and
 * at the corners where it wraps. 6px round what's in it: a 44px search and
 * 36px chips (FILTER_CHIP).
 */
export const GLASS_BAR =
  "search-field rounded-[25px] p-1.5 [--search-blur:16px] [--search-fill:linear-gradient(180deg,rgb(255_255_255/0.72),rgb(255_255_255/0.52))] xl:rounded-full"

/** A filter chip in a GLASS_BAR, which the picked one's copy (SLIDING_PILL) shares to line up with it. */
export const FILTER_CHIP =
  "inline-flex h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-4 text-[15px] font-medium tracking-[-0.01em]"

// On the white sheet the dashboard, the editor, the templates pages and their
// dialogs are on (styles/sheet.css). Each look comes without a size, which sheetPill adds,
// so one button's size never has to beat another's: Tailwind puts utilities
// that set the same thing in order of their value, not the order they're
// written in, so `px-4` after `px-5` would lose.
const SHEET_LOOKS = {
  /** The main action: a blue pill in a halo of its own blue (blue-button). */
  blue: "blue-button disabled:opacity-50",
  /** Any other button standing on the sheet: a white pill (white-button). */
  white: "white-button disabled:opacity-50",
  /** A button that's only its words, as Cancel beside Create: grey, shaded under the pointer. */
  text: "text-ink-2 transition-colors duration-150 hover:bg-fill hover:text-ink disabled:opacity-50 disabled:hover:bg-transparent",
  /** For a choice that deletes something. */
  danger: "bg-alert text-white transition-colors duration-150 hover:bg-[#912018]",
}

/** A button on the sheet in one of its looks, at a size: unless `size` says otherwise, 40px tall with 15px words. */
export function sheetPill(look: keyof typeof SHEET_LOOKS, size = "h-10 px-5 text-[15px] font-medium") {
  return `inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-full tracking-[-0.01em] disabled:cursor-not-allowed [&_svg]:size-4 ${size} ${SHEET_LOOKS[look]}`
}

export const BLUE_PILL = sheetPill("blue")
export const WHITE_PILL = sheetPill("white")
export const TEXT_PILL = sheetPill("text")

/**
 * A grey track of choices on the sheet, 46px tall, with the chosen one on a
 * white pill (useThumb) 5px in from its edge: SEGMENT is each choice, with
 * its own padding across.
 */
export const SEGMENTS = "segment-track h-[46px] max-w-full gap-0.5 p-[5px]"
export const SEGMENT =
  "relative inline-flex h-9 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-full text-[15px] font-medium tracking-[-0.01em] transition-colors duration-150 focus-visible:outline-none [&_svg]:size-4"

/** A smaller outline pill, for a toolbar and the controls inside a dialog. */
export const SMALL_PILL =
  "inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-full bg-sheet/70 px-3.5 text-sm text-ink ring-1 ring-inset ring-ink/15 transition-[background-color,box-shadow] duration-200 hover:bg-sheet hover:ring-ink/40 motion-reduce:transition-none"
