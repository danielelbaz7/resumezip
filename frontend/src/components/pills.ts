// The site's buttons, on every page: the main action is an ink pill, and
// everything else an outline pill, on the desk or a dialog's glass.

const SHAPE =
  "inline-flex h-10 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-full px-[18px] text-[15px] font-medium tracking-[-0.01em] disabled:cursor-not-allowed disabled:opacity-50"
const PILL = `${SHAPE} transition-[background-color,box-shadow] duration-200 motion-reduce:transition-none`

/** The main action: it lifts under the pointer and sinks as it's pressed (ink-button, lift-button in globals.css). */
export const INK_PILL = `${SHAPE} ink-button lift-button`

export const OUTLINE_PILL = `${PILL} bg-sheet/70 text-ink ring-1 ring-inset ring-ink/15 hover:bg-sheet hover:ring-ink/40`

/**
 * A row of buttons on one pane of frosted glass, as a toolbar: rounded like a
 * pill on one line, and still rounded where it wraps onto two.
 */
export const GLASS_DOCK = "glass glass-float inline-flex flex-wrap items-center gap-1 rounded-[25px] p-[5px]"

/** A button in a GLASS_DOCK: no fill or edge of its own, a tint under the pointer. */
export const DOCK_PILL = `${PILL} text-ink hover:bg-ink/[0.06] disabled:hover:bg-transparent`

/** The main action in a GLASS_DOCK: ink glass, with a glossy lit top (ink-glass in globals.css). */
export const INK_GLASS_PILL = `${SHAPE} ink-glass`

/** For a choice that deletes something for good. */
export const DANGER_PILL = `${PILL} bg-alert text-white hover:bg-[#912018]`

/** A smaller outline pill, for a toolbar and the controls inside a dialog. */
export const SMALL_PILL =
  "inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-full bg-sheet/70 px-3.5 text-sm text-ink ring-1 ring-inset ring-ink/15 transition-[background-color,box-shadow] duration-200 hover:bg-sheet hover:ring-ink/40 motion-reduce:transition-none"
