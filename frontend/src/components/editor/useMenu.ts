import type React from "react"
import { useEffect, useRef, useState } from "react"
import { reducedMotion } from "./layout"

interface MenuOptions {
  /** How long the menu takes to fade away, in milliseconds, as its closing classes say. */
  closeMs: number
  /** Follows the button as anything scrolls, too: a menu fixed to the window, as one in a portal is, doesn't scroll with it. */
  followScroll?: boolean
  /** ← and → move between the choices as ↑ and ↓ do. */
  sideways?: boolean
}

/**
 * A menu button's menu (WAI-ARIA menu button), as the editor's menus work:
 * placed by its button (`placeBy`) as it opens, and following it; fading
 * away as it closes; and closed by a click elsewhere, or by Escape or Tab,
 * which put the keyboard back on the button. What a menu does as it opens,
 * and which choice gets the keyboard, are its own.
 */
export function useMenu<Place>(placeBy: (button: HTMLElement) => Place, { closeMs, followScroll = false, sideways = false }: MenuOptions) {
  const button = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  // Where the menu is while it's there, or null.
  const [place, setPlace] = useState<Place | null>(null)
  const [closing, setClosing] = useState(false)
  const timer = useRef(0)
  const open = place !== null && !closing

  const show = () => {
    if (!button.current) return
    window.clearTimeout(timer.current)
    setClosing(false)
    setPlace(placeBy(button.current))
  }

  // It fades away, then goes. `refocus` puts the keyboard back on the button, as Escape does.
  const close = (refocus = false) => {
    if (refocus) button.current?.focus()
    setClosing(true)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(
      () => {
        setPlace(null)
        setClosing(false)
      },
      reducedMotion() ? 0 : closeMs,
    )
  }
  const latestClose = useRef(close)
  latestClose.current = close

  useEffect(() => () => window.clearTimeout(timer.current), [])

  // A click elsewhere closes it, and what was clicked keeps the focus. It
  // follows the button as the window is resized, and with `followScroll`, as
  // what it's in scrolls.
  const shown = place !== null
  useEffect(() => {
    if (!shown) return
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (menu.current?.contains(target) || button.current?.contains(target)) return
      latestClose.current()
    }
    // Only a menu that's still there moves: a resize or a scroll in the moment it goes, as the page scrolls to
    // a section just added, mustn't put it back.
    const follow = () => setPlace((current) => (current && button.current ? placeBy(button.current) : current))
    document.addEventListener("pointerdown", onPointerDown)
    window.addEventListener("resize", follow)
    if (followScroll) window.addEventListener("scroll", follow, true)
    return () => {
      document.removeEventListener("pointerdown", onPointerDown)
      window.removeEventListener("resize", follow)
      if (followScroll) window.removeEventListener("scroll", follow, true)
    }
  }, [shown, placeBy, followScroll])

  // Arrows, Home and End move between the menu's choices, or those in
  // `within`, round from either end (WAI-ARIA menu pattern). Escape and Tab close it.
  const onMenuKeyDown = (event: React.KeyboardEvent, within: ParentNode | null = menu.current) => {
    const items = [...(within?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])]
    const index = items.indexOf(document.activeElement as HTMLElement)
    const moveTo = (next: number) => {
      event.preventDefault()
      items[(next + items.length) % items.length]?.focus()
    }
    if (event.key === "ArrowDown" || (sideways && event.key === "ArrowRight")) moveTo(index + 1)
    else if (event.key === "ArrowUp" || (sideways && event.key === "ArrowLeft")) moveTo(index - 1)
    else if (event.key === "Home") moveTo(0)
    else if (event.key === "End") moveTo(items.length - 1)
    else if (event.key === "Escape" || event.key === "Tab") {
      event.preventDefault()
      event.stopPropagation()
      close(true)
    }
  }

  return { button, menu, place, closing, open, show, close, onMenuKeyDown }
}
