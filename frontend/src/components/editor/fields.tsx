"use client"

import type React from "react"
import { Fragment, useEffect, useId, useRef, useState } from "react"
import { ArrowDown, ArrowUp, ArrowUpDown, Pencil } from "lucide-react"
import type { Finding } from "@/lib/check/engine"
import { onMac, shortcut } from "@/lib/keys"
import { markedPieces } from "@/lib/typst/resumeData"
import { bulletLines, moveBullet, nextAnnouncement, setLeftOutLine, withBullets } from "./arrange"
import { selectLineIn } from "./boxDom"
import { reducedMotion, reveal, scrollerOf } from "./layout"
import { StyledBox } from "./StyledBox"

interface FieldProps {
  label: string
  value: string
  placeholder?: string
  type?: string
  className?: string
  onChange: (value: string) => void
  /** The field's key, so the checker can find it on the page. */
  name?: string
  /** What the checker found here, while the person is fixing it. */
  flag?: Finding | null
  /** Counts up each time the person chooses `flag`'s finding, as the checker's requests do. */
  request?: number
  /** What the browser can fill it in with, as "name", "email" or "tel". */
  autoComplete?: string
  /** A web address: phones show the keyboard for one, with no spelling marks and no capital first letter. */
  web?: boolean
  /** What belongs in a one-line field, shown under it and read out with it. */
  hint?: string
  /** A few lines of prose, as the summary: a box that grows with them, where Enter starts a new line, with bold and italic words. */
  multiline?: boolean
}

/**
 * A finding's tier, as the Check tab shows it: a must-fix (red), which costs
 * points and holds the score down; worth a look (yellow), which costs points
 * and can be dismissed; or optional advice (blue), which doesn't count.
 */
export type Tier = "fix" | "look" | "optional"

export const tierOf = (finding: Pick<Finding, "level" | "advisory">): Tier => (finding.advisory ? "optional" : finding.level)

export const TIER_NAMES: Record<Tier, string> = { fix: "Must fix", look: "Worth a look", optional: "Optional" }

/** Each tier's color, as a dot, a pill and the line down a finding's side. */
export const TIER_BG: Record<Tier, string> = { fix: "bg-alert", look: "bg-caution", optional: "bg-accent" }

/** A small pill for a finding's tier, in its color. */
export const levelPill = (tier: Tier) =>
  `inline-flex h-5 shrink-0 items-center rounded-full px-2 text-[11px] font-medium leading-none ${TIER_BG[tier]} ${
    tier === "look" ? "text-ink" : "text-white"
  }`

/**
 * What the checker found where the person is fixing it, and why it matters.
 * It says how sure the checker is in words, so the field's color isn't the
 * only sign. Its lines are balanced, as a sentence a little too long for the
 * box would otherwise leave a word or two on a line of its own.
 */
export function FlagNote({ id, finding }: { id?: string; finding: Finding }) {
  return (
    <div
      id={id}
      className="flex flex-col gap-2 rounded-[4px] bg-sheet px-4 py-3 text-[13px] leading-normal text-balance ring-1 ring-ink/[0.08]"
    >
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-ink">
        <span className={levelPill(tierOf(finding))}>{TIER_NAMES[tierOf(finding)]}</span>
        {finding.message}
      </p>
      <p className="text-ink-2">{finding.why}</p>
      {finding.suggestion && <p className="text-ink-2">{finding.suggestion}</p>}
    </div>
  )
}

/**
 * A labelled, underlined text input, or a box for a few lines of prose with
 * bold and italic words. A label can't be for that box, a div, so it's a div
 * too, and a click on its name puts the cursor in the box.
 */
export function Field({
  label,
  value,
  placeholder,
  type = "text",
  className = "",
  onChange,
  name,
  flag,
  autoComplete,
  web,
  multiline,
  hint,
}: FieldProps) {
  const noteId = useId()
  const boxId = useId()
  const hintId = useId()
  const describedBy = [hint && hintId, flag && noteId].filter(Boolean).join(" ") || undefined
  const look = `relative w-full min-w-0 border-0 bg-transparent py-2 text-base text-ink outline-none transition-colors focus-visible:outline-none ${
    !flag ? "border-b border-rule-strong hover:border-ink/40" : "border-b-2 border-accent"
  }`
  const Labelled = multiline ? "div" : "label"
  return (
    <div data-field={name} className={`flex min-w-0 flex-col gap-1.5 ${className}`}>
      <Labelled className="group/field relative flex min-w-0 flex-col gap-1.5">
        <span
          id={`${boxId}-label`}
          onClick={multiline ? () => document.getElementById(boxId)?.focus() : undefined}
          className="label-mono text-ink-2 transition-colors group-focus-within/field:text-accent"
        >
          {label}
        </span>
        {/* A soft blue light rises from the line while the field has focus. It's under the box (which
            is `relative`, and later), so the text stays crisp, and nothing moves. */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 h-10 rounded-t-[6px] bg-linear-to-t from-accent/[0.09] to-accent/0 opacity-0 transition-opacity duration-200 ease-out group-focus-within/field:opacity-100 motion-reduce:transition-none"
        />
        {multiline ? (
          <StyledBox
            kind="prose"
            id={boxId}
            value={value}
            onChange={onChange}
            labelId={`${boxId}-label`}
            describedBy={flag ? `${hintId} ${noteId}` : hintId}
            invalid={flag?.level === "fix"}
            placeholder={placeholder}
            // As tall as three lines, as the text box it replaced was.
            className={`${look} min-h-24 leading-relaxed`}
          />
        ) : (
          <input
            type={type}
            value={value}
            placeholder={placeholder}
            aria-describedby={describedBy}
            aria-invalid={flag?.level === "fix" || undefined}
            autoComplete={autoComplete}
            inputMode={web ? "url" : undefined}
            spellCheck={web ? false : undefined}
            autoCapitalize={web ? "off" : undefined}
            onChange={(event) => onChange(event.target.value)}
            className={`${look} placeholder:text-ink-2/50`}
          />
        )}
        {/* The field being typed in is underlined in blue, drawn out from the left, with a glow. */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 origin-left scale-x-0 bg-accent shadow-[0_0_10px_rgb(46_91_230/0.55)] transition-transform duration-300 ease-glide group-focus-within/field:scale-x-100 motion-reduce:transition-none"
        />
      </Labelled>
      {multiline ? (
        <span id={hintId} className="text-[13px] leading-normal text-ink-2">
          <FormatHint />
        </span>
      ) : (
        hint && (
          <span id={hintId} className="text-[13px] leading-normal text-ink-2">
            {hint}
          </span>
        )
      )}
      {flag && <FlagNote id={noteId} finding={flag} />}
    </div>
  )
}

/** Selects a line's words in a bullets box, after its "• ", to point at one bullet. */
export function selectLine(field: HTMLElement, line: number) {
  if (field.isContentEditable) selectLineIn(field, line)
}

/**
 * Buttons that move something up or down one place in its list. At either
 * end, the button that can't move it stays where it is (and focusable, so
 * the focus isn't lost when something reaches the end), but does nothing.
 * What moved can go past the edge of the screen, or under the bars pinned
 * there, so the screen follows the button.
 */
export function MoveButtons({ name, first, last, onMove }: { name: string; first: boolean; last: boolean; onMove: (by: -1 | 1) => void }) {
  return (
    <span className="flex shrink-0 items-center">
      {([-1, 1] as const).map((by) => {
        const end = by < 0 ? first : last
        const Icon = by < 0 ? ArrowUp : ArrowDown
        return (
          <button
            key={by}
            type="button"
            data-move={by}
            onClick={(event) => {
              if (end) return
              const button = event.currentTarget
              onMove(by)
              requestAnimationFrame(() => reveal(button, scrollerOf(button), reducedMotion()))
            }}
            aria-label={`Move ${name} ${by < 0 ? "up" : "down"}`}
            aria-disabled={end || undefined}
            className="rounded-full p-1.5 text-ink-2 transition-colors hover:text-ink aria-disabled:cursor-default aria-disabled:opacity-30 aria-disabled:hover:text-ink-2"
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
          </button>
        )
      })}
    </span>
  )
}

// With Option on a Mac, Alt elsewhere: ⌥↑, Alt+↑.
const altShortcut = (key: string) => (onMac() ? `⌥${key}` : `Alt+${key}`)

/**
 * The keys for bold and italic, and with `moveLines`, for moving a line. A
 * touch screen has no keys, so it shows the marks to type, which turn bold and
 * italic as they're typed.
 */
export function FormatHint({ moveLines = false }: { moveLines?: boolean }) {
  return window.matchMedia("(pointer: coarse)").matches ? (
    <>
      <span className="font-mono">**bold**</span> · <span className="font-mono">*italic*</span>
    </>
  ) : (
    <>
      <kbd className="font-mono">{shortcut("B")}</kbd> <strong className="font-semibold text-ink">bold</strong> ·{" "}
      <kbd className="font-mono">{shortcut("I")}</kbd> <em className="text-ink">italic</em>
      {moveLines && (
        <>
          {" "}
          · <kbd className="font-mono">{altShortcut("↑")}</kbd> <kbd className="font-mono">{altShortcut("↓")}</kbd> move a line
        </>
      )}
    </>
  )
}

/** How much of a bullet an open card shows until its box is used, in characters, cut at a word: about a line and a half. */
const PREVIEW_CHARACTERS = 70
/** How many bullets an open card shows until its box is used. */
const PREVIEW_BULLETS = 2

/** A bullet's words without their bold and italic marks, cut short at a word, with "…" where they were cut. */
function previewOf(words: string): string {
  const plain = markedPieces(words)
    .map((piece) => piece.text)
    .join("")
  if (plain.length <= PREVIEW_CHARACTERS) return plain
  const cut = plain.slice(0, PREVIEW_CHARACTERS + 1)
  const space = cut.lastIndexOf(" ")
  return `${(space > PREVIEW_CHARACTERS / 2 ? cut.slice(0, space) : cut.slice(0, PREVIEW_CHARACTERS)).replace(/[\s,.;:]+$/, "")}…`
}

/**
 * A box for bullet points: one per line, and Enter starts a new bullet. Bold
 * and italic words show as they print, and are saved as **bold**, *italic*
 * and ***both***; ⌘B and ⌘I add or remove them. Alt+↑ and Alt+↓ move the line
 * the cursor is on. "Arrange" shows the bullets as a list instead, to move
 * them and leave them out of the PDF.
 *
 * With `compact`, as in an entry's card, it shows its first bullets cut short
 * and how many more there are until it's used: the box itself is over them,
 * unseen, so a click or Tab goes into it, and screen readers read all of it.
 */
export function BulletsField({
  label,
  value,
  placeholder,
  className = "",
  onChange,
  name,
  flag,
  request,
  compact = false,
}: FieldProps & { compact?: boolean }) {
  const text = withBullets(value)
  const boxId = useId()
  const hintId = useId()
  const noteId = useId()
  const bullets = bulletLines(text)
  const [arranging, setArranging] = useState(false)
  // Once the box has been used, it shows in full until its card is folded.
  const [used, setUsed] = useState(false)
  // Choosing a finding here shows the text, where the cursor goes to it. Only a
  // new choice does: the finding is found afresh each time the checker runs,
  // and it's gone while the person is in Write mode, then back.
  const [shownRequest, setShownRequest] = useState(request)
  if (request !== undefined && request !== shownRequest) {
    setShownRequest(request)
    setArranging(false)
    setUsed(true)
  }
  const previewing = compact && !used && !arranging && bullets.length > 0
  // A white box with a thin edge, which darkens while it's typed in; the cut-short bullets are drawn in the same box.
  const box = `w-full rounded-[6px] border bg-sheet px-4 py-3.5 text-[16px] leading-[1.7] text-ink outline-none transition-colors duration-200 focus-visible:outline-none motion-reduce:transition-none md:text-[15px] ${
    !flag ? "border-rule focus:border-ink/30" : "border-accent ring-1 ring-accent"
  }`

  return (
    <div data-field={name} className={`group/field flex min-w-0 flex-col gap-2 ${className}`}>
      <div className="flex items-center justify-between gap-3">
        {/* Blue while typing in the box, as a field's label is; not while on Arrange. A
            label can't be for a div, so a click on it puts the cursor in the box itself. */}
        <label
          id={`${boxId}-label`}
          onClick={() => document.getElementById(boxId)?.focus()}
          className="label-mono text-ink-2 transition-colors group-has-[[contenteditable]:focus]/field:text-accent"
        >
          {label}
        </label>
        {(arranging || bullets.length > 0) && (
          <button
            type="button"
            onClick={() => {
              setArranging(!arranging)
              setUsed(true)
            }}
            aria-label={arranging ? "Done arranging bullets" : "Arrange bullets"}
            className="-my-1.5 -mr-2.5 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-sm text-ink-2 transition-colors hover:bg-ink/[0.05] hover:text-ink"
          >
            {arranging ? (
              "Done"
            ) : (
              <>
                <ArrowUpDown className="h-3.5 w-3.5" aria-hidden="true" />
                Arrange
              </>
            )}
          </button>
        )}
      </div>
      {arranging ? (
        <ArrangedBullets labelId={`${boxId}-label`} text={text} onChange={onChange} />
      ) : (
        <div className="relative" onFocus={() => setUsed(true)}>
          {previewing && (
            <div aria-hidden="true" className={`${box} flex flex-col`}>
              {bullets.slice(0, PREVIEW_BULLETS).map((bullet) => (
                <p key={bullet.line} className={bullet.leftOut ? "text-ink-2" : undefined}>
                  {bullet.leftOut ? "○" : "•"} {previewOf(bullet.words)}
                </p>
              ))}
              {bullets.length > PREVIEW_BULLETS && (
                <p className="mt-0.5 text-[13px] text-ink-2">+ {bullets.length - PREVIEW_BULLETS} more</p>
              )}
            </div>
          )}
          {/* While the bullets show cut short, the box is over them, unseen, and no taller. */}
          <div className={previewing ? "absolute inset-0 overflow-hidden opacity-0" : undefined}>
            <StyledBox
              kind="bullets"
              id={boxId}
              value={value}
              onChange={onChange}
              labelId={`${boxId}-label`}
              describedBy={flag ? `${hintId} ${noteId}` : hintId}
              invalid={flag?.level === "fix"}
              placeholder={placeholder}
              className={`${box} ${compact ? "min-h-[110px]" : "min-h-[132px]"}`}
            />
          </div>
        </div>
      )}
      {flag && <FlagNote id={noteId} finding={flag} />}
      {!arranging && (
        <span id={hintId} className={`text-[13px] leading-normal text-ink-2 ${previewing ? "sr-only" : ""}`}>
          One bullet per line · <FormatHint moveLines />
          {bullets.some((bullet) => bullet.leftOut) && " · Lines starting with ○ are left out of the PDF."}
        </span>
      )}
    </div>
  )
}

/** A bullet's words, bold and italic where they're marked, as they print. */
function MarkedWords({ words }: { words: string }) {
  return markedPieces(words).map(({ text, bold, italic }, index) => {
    const shown = italic ? <em>{text}</em> : text
    return bold ? (
      <strong key={index} className="font-semibold">
        {shown}
      </strong>
    ) : (
      <Fragment key={index}>{shown}</Fragment>
    )
  })
}

/**
 * The bullets as a list, each with a box to leave it out of the PDF and
 * buttons to move it. A bullet keeps the focus as it moves, so it can be
 * moved again and again from the keyboard.
 */
function ArrangedBullets({ labelId, text, onChange }: { labelId: string; text: string; onChange: (value: string) => void }) {
  const bullets = bulletLines(text)
  // Bullets have no ids, so each gets a key here that moves with it, even
  // past a bullet with the same words. So React moves a bullet's row with it,
  // and the focus goes along. If the bullets change some other way (another
  // tab), they're keyed afresh.
  const [order, setOrder] = useState(() => bullets.map((_, index) => index))
  const keys = order.length === bullets.length ? order : bullets.map((_, index) => index)
  const keyed = bullets.map((bullet, index) => ({ ...bullet, key: keys[index] }))
  const [announcement, setAnnouncement] = useState("")

  return (
    <div className="flex flex-col gap-2">
      <ul aria-labelledby={labelId} className="flex flex-col overflow-hidden rounded-[6px] border border-rule bg-sheet">
        {keyed.map((bullet, index) => (
          <li key={bullet.key} className="flex items-start gap-3 border-b border-rule px-4 py-2 last:border-b-0">
            <input
              type="checkbox"
              checked={!bullet.leftOut}
              onChange={(event) => onChange(setLeftOutLine(text, bullet.line, !event.target.checked))}
              aria-label={`Include bullet ${index + 1} in the PDF`}
              className="mt-1.5 h-4 w-4 shrink-0 accent-accent"
            />
            <span className={`min-w-0 flex-1 py-0.5 text-[15px] leading-[1.6] ${bullet.leftOut ? "text-ink-2" : "text-ink"}`}>
              <MarkedWords words={bullet.words} />
              {bullet.leftOut && <span className="label-mono ml-2 whitespace-nowrap text-ink-2">Left out</span>}
            </span>
            <MoveButtons
              name={`bullet ${index + 1}`}
              first={index === 0}
              last={index === keyed.length - 1}
              onMove={(by) => {
                const next = [...keys]
                ;[next[index], next[index + by]] = [next[index + by], next[index]]
                setOrder(next)
                onChange(moveBullet(text, bullet.line, by))
                setAnnouncement((last) => nextAnnouncement(last, `Moved to ${index + by + 1} of ${keyed.length}`))
              }}
            />
          </li>
        ))}
      </ul>
      <p className="text-[13px] leading-normal text-ink-2">
        Untick a bullet to leave it out of the PDF. It stays here, so you can put it back.
      </p>
      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  )
}

interface SectionHeadingProps {
  title: string
  /** A line under the title, as "3 entries · drag to reorder". */
  note?: string
  /** When given, the title can be renamed. */
  onRename?: (title: string) => void
  /** What the checker found about the section or its title, while the person is fixing it. */
  flag?: Finding | null
  allowEmpty?: boolean
  /** At the far end of the title, as a section's Delete. */
  end?: React.ReactNode
}

/** The big serif title at the top of each section, optionally renameable, with a note under it. */
export function SectionHeading({ title, note, onRename, flag, allowEmpty = false, end }: SectionHeadingProps) {
  const [draft, setDraft] = useState<string | null>(null)
  const renameButton = useRef<HTMLButtonElement>(null)
  // Set when the rename ends from the keyboard, so the focus goes back to the
  // rename button rather than to the page. Clicking away keeps it where it went.
  const refocus = useRef(false)

  useEffect(() => {
    if (draft !== null || !refocus.current) return
    refocus.current = false
    renameButton.current?.focus()
  }, [draft])

  const save = () => {
    if (draft !== null && (allowEmpty || draft.trim()) && draft.trim() !== title) onRename?.(draft.trim())
    setDraft(null)
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-col gap-[5px]">
          {draft === null ? (
            <div className="group/title flex min-w-0 flex-wrap items-center gap-1.5">
              <h1 tabIndex={-1} className="min-w-0 font-serif text-[34px] leading-[1.1] tracking-[-0.03em] wrap-anywhere sm:text-[40px]">
                {title}
              </h1>
              {onRename && (
                <button
                  ref={renameButton}
                  type="button"
                  aria-label="Rename section"
                  title="Rename section"
                  onClick={() => setDraft(title)}
                  className="rounded-full p-1.5 text-ink-3 transition-[color,opacity] hover:text-ink [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/title:opacity-100 [@media(hover:hover)]:focus-visible:opacity-100"
                >
                  <Pencil className="h-4 w-4" />
                </button>
              )}
            </div>
          ) : (
            <input
              aria-label="Section title"
              autoFocus
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onBlur={save}
              onKeyDown={(event) => {
                if (event.key !== "Enter" && event.key !== "Escape") return
                // The focus is back on the rename button before Enter is done, so
                // Enter mustn't go on to press it and open the rename again.
                event.preventDefault()
                refocus.current = true
                if (event.key === "Enter") save()
                else setDraft(null)
              }}
              className="w-full border-0 border-b-[1.5px] border-accent bg-transparent font-serif text-[34px] leading-[1.1] tracking-[-0.03em] outline-none focus-visible:outline-none sm:text-[40px]"
            />
          )}
          {note && <p className="text-[14px] leading-5 text-ink-3">{note}</p>}
        </div>
        {end && <div className="-mb-1.5 ml-auto shrink-0">{end}</div>}
      </div>
      {flag && <FlagNote finding={flag} />}
    </div>
  )
}
