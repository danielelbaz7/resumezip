"use client"

import { useEffect, useRef, useState } from "react"
import { RowAction, TrashIcon } from "@/components/dashboard/RowActions"
import { sheetPill } from "@/components/pills"
import { ago } from "@/lib/ago"
import type { PastReview } from "@/lib/review/past"
import { verdictOf, VERDICT_WORDS } from "@/lib/review/verdict"

function details(review: PastReview): string {
  const red = review.notes?.filter((note) => note.tone === "red").length
  return [
    ago(new Date(review.savedAt).toISOString()),
    VERDICT_WORDS[verdictOf(review.total)],
    `${review.total}/100`,
    red !== undefined && (red === 1 ? "1 red flag" : `${red} red flags`),
  ]
    .filter(Boolean)
    .join(" · ")
}

// What's asked about: one past review, by its id, or ALL of them. An id is 64 hex digits, so it's never ALL.
const ALL = "all"

/** Round what would go, while it's asked about: the red edge an entry in the editor gets (SectionForm), inside the row. */
const RED_LINE =
  "pointer-events-none absolute inset-1 rounded-[14px] border-2 border-alert transition-opacity duration-200 motion-reduce:transition-none starting:opacity-0"

/**
 * Asks whether to delete, in the editor's words and look (SectionForm's
 * "Delete it?"), where the button that asked was. Keep has the focus, so
 * Escape or Enter backs out. On a phone only its buttons show, as the red
 * line says what would go.
 */
function Ask({ question, onKeep, onDelete }: { question: string; onKeep: () => void; onDelete: () => void }) {
  const keep = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    keep.current?.focus()
  }, [])
  return (
    // It fades in (`starting:` is CSS @starting-style), as tall as the button it replaces.
    <span
      className="flex h-10 shrink-0 items-center gap-2 transition-opacity duration-200 motion-reduce:transition-none starting:opacity-0"
      onKeyDown={(event) => {
        if (event.key === "Escape") onKeep()
      }}
    >
      <span role="status" className="mr-1 text-sm text-ink max-sm:sr-only">
        {question}
      </span>
      <button ref={keep} type="button" onClick={onKeep} className={sheetPill("white", "h-9 px-4 text-[15px] font-medium")}>
        Keep
      </button>
      <button type="button" onClick={onDelete} className={sheetPill("danger", "h-9 px-4 text-[15px] font-medium")}>
        Delete
      </button>
    </span>
  )
}

/**
 * The files reviewed in this browser before, newest first, under the drop
 * zone: each opens as it was reviewed, and each can be deleted, or all of
 * them. Either asks first. Nothing is shown when there are none.
 */
export default function PastReviews({
  reviews,
  problem,
  onOpen,
  onDelete,
  onDeleteAll,
}: {
  reviews: readonly PastReview[]
  /** Why one couldn't be deleted, if it couldn't. */
  problem: string | null
  onOpen: (review: PastReview) => void
  /** Each resolves to whether it was deleted: if it wasn't, the question stays, to try again. */
  onDelete: (review: PastReview) => Promise<boolean>
  onDeleteAll: () => Promise<boolean>
}) {
  const [asking, setAsking] = useState<string | null>(null)
  const section = useRef<HTMLElement>(null)
  // A second click on Delete while the first is still deleting would delete nothing, and take its Undo away.
  const deleting = useRef(false)
  if (reviews.length === 0) return null

  // The button that asked is back once the question's gone, and has the focus again.
  const keep = (asked: string) => {
    setAsking(null)
    requestAnimationFrame(() => section.current?.querySelector<HTMLElement>(`[data-asks="${CSS.escape(asked)}"]`)?.focus())
  }

  const remove = async (asked: string, review?: PastReview) => {
    if (deleting.current) return
    deleting.current = true
    const deleted = await (review ? onDelete(review) : onDeleteAll())
    deleting.current = false
    if (deleted) setAsking((now) => (now === asked ? null : now))
  }

  return (
    <section
      ref={section}
      aria-labelledby="past-reviews"
      className="glass glass-solid mt-12 w-full max-w-[460px] overflow-hidden rounded-[18px] text-left"
    >
      <div className="flex min-h-11 items-center justify-between gap-3 border-b border-rule pl-4 pr-2">
        <h2 id="past-reviews" className="label-mono text-ink-2">
          Past reviews
        </h2>
        {asking === ALL ? (
          <Ask question="Delete all?" onKeep={() => keep(ALL)} onDelete={() => void remove(ALL)} />
        ) : (
          <button type="button" data-asks={ALL} className={sheetPill("text", "h-8 px-3 text-[13px]")} onClick={() => setAsking(ALL)}>
            Clear all
          </button>
        )}
      </div>
      <div className="relative">
        <ul>
          {reviews.map((review) => {
            const asked = asking === review.id
            const going = asked || asking === ALL
            return (
              <li key={review.id} className="relative flex items-center border-b border-rule last:border-b-0">
                {asked && <span aria-hidden="true" className={RED_LINE} />}
                {/* Asked about, its name stays and the rest fades, so it's clear what would go. It has no width of
                    its own (w-0), so its lines, which don't wrap, are cut short rather than widening the list, and
                    the page, past a phone's screen. */}
                <button
                  type="button"
                  data-past-review={review.id}
                  inert={going}
                  onClick={() => onOpen(review)}
                  className="flex w-0 flex-1 flex-col gap-0.5 px-4 py-3 text-left transition-colors hover:bg-ink/[0.03] focus-visible:outline-offset-[-2px]"
                >
                  <span className="truncate text-[15px] text-ink">{review.title}</span>
                  <span
                    className={`truncate text-[12.5px] tabular-nums text-ink-2 transition-opacity duration-200 motion-reduce:transition-none ${going ? "opacity-30" : ""}`}
                  >
                    {details(review)}
                  </span>
                </button>
                <span className="mr-2 flex shrink-0">
                  {asked ? (
                    <Ask question="Delete this review?" onKeep={() => keep(review.id)} onDelete={() => void remove(review.id, review)} />
                  ) : (
                    <RowAction
                      data-asks={review.id}
                      label={`Delete the review of ${review.title}`}
                      tip="Delete"
                      tipAtEnd
                      danger
                      onClick={() => setAsking(review.id)}
                    >
                      <TrashIcon />
                    </RowAction>
                  )}
                </span>
              </li>
            )
          })}
        </ul>
        {asking === ALL && <span aria-hidden="true" className={RED_LINE} />}
      </div>
      {problem && (
        <p role="alert" className="border-t border-rule px-4 py-2.5 text-[13px] text-alert">
          {problem}
        </p>
      )}
    </section>
  )
}
