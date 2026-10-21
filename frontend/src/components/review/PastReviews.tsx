"use client"

import { useState } from "react"
import { Trash2 } from "lucide-react"
import { ago } from "@/lib/ago"
import type { PastReview } from "@/lib/review/past"
import { verdictOf, VERDICT_WORDS } from "@/lib/review/verdict"

function details(review: PastReview): string {
  const red = review.notes?.filter((note) => note.tone === "red").length
  return [
    ago(new Date(review.savedAt).toISOString()),
    `ATS checks: ${VERDICT_WORDS[verdictOf(review.total)].toLowerCase()}`,
    `${review.total}/100`,
    red === undefined ? "AI: not included" : red === 0 ? "AI: no red flags" : red === 1 ? "AI: 1 red flag" : `AI: ${red} red flags`,
  ]
    .filter(Boolean)
    .join(" · ")
}

/**
 * The files reviewed in this browser before, newest first, under the drop
 * zone: each opens as it was reviewed, and each can be deleted, or all of them,
 * which asks first. Nothing is shown when there are none.
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
  onDelete: (review: PastReview) => void
  onDeleteAll: () => void
}) {
  const [asking, setAsking] = useState(false)
  if (reviews.length === 0) return null
  return (
    <section
      aria-labelledby="past-reviews"
      className="glass glass-solid mt-12 w-full max-w-[460px] overflow-hidden rounded-[18px] text-left"
    >
      <div className="flex min-h-11 items-center justify-between gap-3 border-b border-rule px-4">
        <h2 id="past-reviews" className="label-mono text-ink-2">
          Past reviews
        </h2>
        {asking ? (
          <p className="flex items-center gap-3 text-[13px]">
            <span className="text-ink-2">Delete all?</span>
            <button
              type="button"
              className="font-medium text-alert hover:underline"
              onClick={() => {
                setAsking(false)
                onDeleteAll()
              }}
            >
              Delete
            </button>
            <button type="button" className="font-medium text-ink hover:underline" onClick={() => setAsking(false)}>
              Keep
            </button>
          </p>
        ) : (
          <button type="button" className="text-[13px] text-ink-2 hover:text-ink hover:underline" onClick={() => setAsking(true)}>
            Clear all
          </button>
        )}
      </div>
      <ul>
        {reviews.map((review) => (
          <li key={review.id} className="flex items-center border-b border-rule last:border-b-0">
            <button
              type="button"
              onClick={() => onOpen(review)}
              className="flex min-w-0 flex-1 flex-col gap-0.5 px-4 py-3 text-left transition-colors hover:bg-ink/[0.03] focus-visible:outline-offset-[-2px]"
            >
              <span className="truncate text-[15px] text-ink">{review.title}</span>
              <span className="text-pretty text-[12.5px] tabular-nums text-ink-2">{details(review)}</span>
            </button>
            <button
              type="button"
              aria-label={`Delete the review of ${review.title}`}
              onClick={() => onDelete(review)}
              className="mr-2 grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink-2 transition-colors hover:bg-ink/[0.05] hover:text-ink"
            >
              <Trash2 aria-hidden="true" className="h-4 w-4" />
            </button>
          </li>
        ))}
      </ul>
      {problem && (
        <p role="alert" className="border-t border-rule px-4 py-2.5 text-[13px] text-alert">
          {problem}
        </p>
      )}
    </section>
  )
}
