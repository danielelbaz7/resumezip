import { useLayoutEffect, useRef, useState } from "react"

// The chosen one of a row of choices: a toggle, a tab or a radio.
const CHOSEN = '[aria-pressed="true"], [aria-selected="true"], [aria-checked="true"]'
const CHOICES = "[aria-pressed], [aria-selected], [aria-checked]"

/**
 * The white pill on a grey track (.segment-thumb in styles/sheet.css) under
 * the chosen one of its choices. `group` goes on the choices' parent, which
 * is `relative`, and `thumb` on the pill, in it. Choosing another slides it
 * there. When a choice changes size or place with nothing chosen anew, as
 * when the font loads or a choice is added before it, it's put there at once.
 * Until it's `placed`, as in the page as built before React runs, the chosen
 * one draws its own.
 *
 * `chosen` is the chosen one's value. `layout` changes whenever the choices
 * themselves do, so new ones are watched too.
 */
export function useThumb(chosen: string, layout = "") {
  const group = useRef<HTMLDivElement>(null)
  const thumb = useRef<HTMLSpanElement>(null)
  // The choice the pill was last put under, so a new one slides it there.
  const at = useRef<string | null>(null)
  const [placed, setPlaced] = useState(false)

  useLayoutEffect(() => {
    const row = group.current
    const pill = thumb.current
    if (!row || !pill) return
    const pressed = row.querySelector<HTMLElement>(CHOSEN)
    pill.style.visibility = pressed ? "" : "hidden"
    if (!pressed) return
    const spot = () => [pressed.offsetLeft, pressed.offsetTop, pressed.offsetWidth, pressed.offsetHeight].join(" ")
    let placedAt = ""
    const place = (slide: boolean) => {
      placedAt = spot()
      pill.style.transitionDuration = slide ? "" : "0s"
      pill.style.translate = `${pressed.offsetLeft}px ${pressed.offsetTop}px`
      pill.style.width = `${pressed.offsetWidth}px`
      pill.style.height = `${pressed.offsetHeight}px`
    }
    place(at.current !== null && at.current !== chosen)
    at.current = chosen
    setPlaced(true)
    // The observer also reports the sizes as it starts, which isn't a change.
    const observer = new ResizeObserver(() => {
      if (spot() !== placedAt) place(false)
    })
    observer.observe(row)
    for (const choice of row.querySelectorAll(CHOICES)) observer.observe(choice)
    return () => observer.disconnect()
  }, [chosen, layout])

  return { group, thumb, placed }
}
