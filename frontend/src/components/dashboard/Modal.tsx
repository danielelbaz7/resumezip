"use client"

import type React from "react"
import { createContext, useContext, useEffect, useId, useRef, useState } from "react"
import { X } from "lucide-react"
import { reducedMotion } from "@/components/editor/layout"

type ModalProps = (
  | { title: string; wide?: false }
  | {
      title?: never
      /** A large dialog that lays out its own content, title included (give the title id="modal-title", which names the dialog). */
      wide: true
    }
) & {
  onClose: () => void
  /**
   * Fades away before onClose is called. Only for a dialog whose onClose just
   * closes it, as New resume's Cancel: not one whose onClose cancels work
   * (opening a file, which mustn't finish while it fades) or may keep it open
   * (the import review asking "Discard your changes?" first).
   */
  fade?: boolean
  /** As wide as New resume's (700px), rather than the usual 448px. */
  large?: boolean
  /** A round × beside the title, which closes it as Escape does. */
  closeButton?: boolean
  children: React.ReactNode
}

// How long a dialog takes to fade away, in milliseconds (matches its closing classes below). It eases
// in and out rather than gliding: a fast start would have it all but gone in the first frames.
const CLOSE_MS = 260

const CloseContext = createContext<() => void>(() => {})

/**
 * Closes the dialog it's in the way Escape does: with `fade`, it fades away,
 * then the dialog's onClose is called. For a Cancel button, so it doesn't vanish at once.
 */
export const useModalClose = () => useContext(CloseContext)

/** Cancel, which closes the dialog as Escape does, fading away with `fade` (useModalClose). */
export function CancelButton({ className }: { className: string }) {
  const close = useModalClose()
  return (
    <button type="button" onClick={close} className={className}>
      Cancel
    </button>
  )
}

// What Tab can reach inside a dialog, before leaving out what's hidden or has tabindex="-1".
const TABBABLE = "a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]"

/**
 * A centred dialog, a white sheet, that closes on Escape or a click outside
 * it, and keeps Tab inside it while it's open. It opens with the focus on its
 * control marked data-autofocus, or else its first.
 */
export default function Modal({ title, onClose, wide = false, fade = false, large = false, closeButton = false, children }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  // Its own, as another dialog can be open alongside it.
  const titleId = useId()
  // Callers pass a new onClose on every render. Reading the latest one from a
  // ref keeps the effect below to the dialog opening, so a parent re-render
  // (as when another tab saves) doesn't pull focus back to the first control.
  const latestClose = useRef(onClose)
  latestClose.current = onClose
  const fades = useRef(fade)
  fades.current = fade
  // Fading away, after which onClose is called.
  const [closing, setClosing] = useState(false)
  const closingRef = useRef(false)
  const closeTimer = useRef(0)
  // What had the focus when it opened, to give it back.
  const opener = useRef<Element | null>(null)
  const close = useRef(() => {
    if (closingRef.current) return
    if (!fades.current || reducedMotion()) return latestClose.current()
    closingRef.current = true
    // Focus goes back as it starts to fade, rather than once it's gone: made
    // inert with the focus in it, Safari would drop the focus on the page instead.
    if (opener.current instanceof HTMLElement) opener.current.focus()
    setClosing(true)
    closeTimer.current = window.setTimeout(() => latestClose.current(), CLOSE_MS)
  })

  useEffect(() => {
    // Tab goes round the dialog's controls, from the last back to the first,
    // and Shift+Tab the other way. It's moved here rather than left to the
    // browser, as Safari's own Tab skips buttons unless set not to, and would
    // leave the dialog. Only the dialog on top does this: the import review
    // stays open under the question it asks before closing.
    const keepTabInside = (event: KeyboardEvent) => {
      const panel = panelRef.current
      const open = document.querySelectorAll('[role="dialog"][aria-modal="true"]')
      if (!panel || open[open.length - 1] !== panel) return
      // A group of radio buttons is one stop: at the one that's chosen, or at
      // its first when none is, as when a type of your own is typed instead.
      const radios = (radio: HTMLInputElement) => [
        ...panel.querySelectorAll<HTMLInputElement>(`input[type="radio"][name="${CSS.escape(radio.name)}"]`),
      ]
      const tabbable = [...panel.querySelectorAll<HTMLElement>(TABBABLE)].filter(
        (element) =>
          element.tabIndex >= 0 &&
          element.getClientRects().length > 0 &&
          !(
            element instanceof HTMLInputElement &&
            element.type === "radio" &&
            !element.checked &&
            (radios(element).some((radio) => radio.checked) || radios(element)[0] !== element)
          ),
      )
      if (tabbable.length === 0) return
      event.preventDefault()
      const active = document.activeElement
      const at = tabbable.findIndex((element) => element === active)
      if (at >= 0) {
        tabbable[(at + (event.shiftKey ? -1 : 1) + tabbable.length) % tabbable.length].focus()
        return
      }
      // From something Tab doesn't stop at, as a section scrolled to, it carries on from there.
      // Outside the dialog altogether, Tab goes to its first control and Shift+Tab to its last.
      const after =
        active && panel.contains(active)
          ? tabbable.findIndex((element) => active.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING)
          : -1
      const before = after < 0 ? tabbable.length - 1 : after - 1
      tabbable[event.shiftKey ? (before + tabbable.length) % tabbable.length : Math.max(after, 0)].focus()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      // An Escape a menu in the dialog has handled closes only that menu (useMenu in MoreMenu.tsx):
      // React's own listener on the document runs first, and its stopPropagation can't stop this one.
      if (event.key === "Escape" && !event.defaultPrevented) close.current()
      else if (event.key === "Tab") keepTabInside(event)
    }
    document.addEventListener("keydown", onKeyDown)
    // Start keyboard users inside the dialog, and put them back where they were once it closes.
    const openedFrom = document.activeElement
    opener.current = openedFrom
    const panel = panelRef.current
    ;(panel?.querySelector<HTMLElement>("[data-autofocus]") ?? panel?.querySelector<HTMLElement>("input, button"))?.focus()
    return () => {
      document.removeEventListener("keydown", onKeyDown)
      // Gone some other way while it faded: its own close doesn't follow.
      window.clearTimeout(closeTimer.current)
      if (openedFrom instanceof HTMLElement) openedFrom.focus()
    }
  }, [])

  // The page behind pales and blurs as it fades in, and the dialog glides
  // into place (`starting:` is CSS @starting-style). The blur belongs to the
  // backdrop that fades: under a fading parent, a blur would only show once
  // the fade had finished.
  return (
    <div
      inert={closing}
      className={`dialog-backdrop fixed inset-0 z-50 flex items-center justify-center p-4 transition-opacity motion-reduce:transition-none starting:opacity-0 ${
        closing ? "opacity-0 duration-[260ms] ease-in-out" : "duration-[240ms] ease-glide"
      }`}
      onMouseDown={(event) => {
        if (event.target !== event.currentTarget) return
        // The browser's own handling of the press would then move focus to the
        // page, undoing where the dialog's effects just put it: back on the
        // opener, or into a dialog that opens instead.
        event.preventDefault()
        close.current()
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={wide ? "modal-title" : titleId}
        className={`dialog-sheet transition-[scale,translate] motion-reduce:transition-none starting:translate-y-2 starting:scale-[0.97] ${
          closing ? "translate-y-2 scale-[0.97] duration-[260ms] ease-in-out" : "duration-300 ease-glide"
        } ${
          wide
            ? "flex h-[min(88vh,880px)] w-full max-w-[1120px] flex-col overflow-hidden"
            : `max-h-[calc(100dvh-2rem)] w-full overflow-y-auto overscroll-contain p-6 sm:p-[30px] ${large ? "max-w-[700px]" : "max-w-md"}`
        }`}
      >
        {!wide && (
          <div className="flex items-start justify-between gap-4">
            <h2
              id={titleId}
              className={`font-serif tracking-[-0.03em] ${large ? "text-[30px] leading-9 sm:text-[36px]" : "text-[30px] leading-[1.1]"}`}
            >
              {title}
            </h2>
            {closeButton && (
              <button
                type="button"
                aria-label="Close"
                onClick={() => close.current()}
                className="-mr-1 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#f3f4f7] text-ink transition-colors duration-150 hover:bg-[#e9ebef] sm:mr-0"
              >
                <X className="h-[18px] w-[18px]" aria-hidden="true" />
              </button>
            )}
          </div>
        )}
        <CloseContext.Provider value={close.current}>{children}</CloseContext.Provider>
      </div>
    </div>
  )
}
