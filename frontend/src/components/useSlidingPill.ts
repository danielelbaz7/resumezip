import { useLayoutEffect, useRef, useState } from "react"

/**
 * The picked chip as a `useSlidingPill` row draws it: a copy of the row's
 * chips in white on ink, laid out as they are, over them. It's cut down to the
 * picked one (its clip-path), and the cut slides to the next one picked, so
 * what it passes over turns white as it goes rather than ink on ink. It's
 * hidden until it's `placed`.
 */
export const SLIDING_PILL =
  "pointer-events-none absolute left-0 top-0 bg-ink text-white transition-[clip-path] duration-300 ease-glide motion-reduce:transition-none"

/**
 * Draws the pressed one of a row of toggle chips (`aria-pressed`) with
 * SLIDING_PILL. `group` goes on the chips' parent, which is `relative`, and
 * `pill` on the copy, in it. Until the pill is `placed`, as in the page as
 * built before React runs, the pressed chip draws itself as picked.
 *
 * `chosen` is the pressed chip's value. `chips` changes whenever the set of
 * chips does, as tags come and go, so new ones are watched too: one added
 * before the pressed chip moves it without anything watched changing size.
 * The pill is put in place then without sliding, as it is when a chip changes
 * size, as when the font loads.
 */
export function useSlidingPill(chosen: string, chips = "") {
  const group = useRef<HTMLDivElement>(null)
  const pill = useRef<HTMLDivElement>(null)
  // The choice the pill was last put on, so a new one slides it there.
  const at = useRef<string | null>(null)
  const [placed, setPlaced] = useState(false)

  useLayoutEffect(() => {
    const row = group.current
    const copy = pill.current
    const pressed = row?.querySelector<HTMLElement>('[aria-pressed="true"]')
    if (!row || !copy || !pressed) return
    // The pressed chip's edges from the copy's, which a row that scrolls sideways moves together.
    const inset = () => {
      const chip = pressed.getBoundingClientRect()
      const all = copy.getBoundingClientRect()
      return [chip.top - all.top, all.right - chip.right, all.bottom - chip.bottom, chip.left - all.left].map((px) => `${px}px`).join(" ")
    }
    let placedAt = ""
    const place = (slide: boolean) => {
      placedAt = inset()
      copy.style.transitionDuration = slide ? "" : "0s"
      copy.style.clipPath = `inset(${placedAt} round 999px)`
    }
    place(at.current !== null && at.current !== chosen)
    at.current = chosen
    setPlaced(true)
    // A chip before the pressed one, or the row, can change size with nothing
    // else changing, which moves it. The observer also reports the sizes as it
    // starts, which isn't a change.
    const observer = new ResizeObserver(() => {
      if (inset() !== placedAt) place(false)
    })
    observer.observe(row)
    for (const chip of row.querySelectorAll("[aria-pressed]")) observer.observe(chip)
    return () => observer.disconnect()
  }, [chosen, chips])

  return { group, pill, placed }
}
