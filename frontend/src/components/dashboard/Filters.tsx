"use client"

import { Check, ChevronDown, LayoutGrid, List } from "lucide-react"
import { useId, type ReactNode } from "react"
import { MENU_ITEM, MENU_PANEL, useMenu } from "./MoreMenu"
import { GLASS_DOCK } from "@/components/pills"
import { SLIDING_PILL, useSlidingPill } from "@/components/useSlidingPill"

export type View = "pages" | "list"
export type Sort = "edited" | "name"

// A tag chip's box, which the picked one's copy (SLIDING_PILL) shares to line up with it.
const TAG = "inline-flex h-9 items-center gap-2 rounded-full px-3.5 text-sm"
// The chips and the sort and view controls each sit in a pane of glass, as a toolbar,
// a little lower than the page's own (GLASS_DOCK), with smaller buttons in it.
const DOCK = `${GLASS_DOCK} p-1`

const SORTS: { id: Sort; name: string }[] = [
  { id: "edited", name: "Last edited" },
  { id: "name", name: "Name" },
]

interface FiltersProps {
  /** The search box, first in the row. */
  search: ReactNode
  /** Each tag in use, with its name and how many resumes have it; "All" first, as "". */
  tags: { id: string; name: string; count: number }[]
  tag: string
  onTag: (tag: string) => void
  sort: Sort
  onSort: (sort: Sort) => void
  view: View
  onView: (view: View) => void
}

/**
 * The row above the resumes: the search, a chip for each tag, how they're
 * sorted, and pages or a list. Where it's too narrow for one line, the chips
 * go under the rest (dashboard.css).
 */
export default function Filters({ search, tags, tag, onTag, sort, onSort, view, onView }: FiltersProps) {
  const { group, pill, placed } = useSlidingPill(tag, tags.map((option) => option.id).join("\n"))
  return (
    <div className="dash-toolbar border-b border-ink pb-5">
      <div className="dash-toolbar-search">{search}</div>
      <div className="dash-toolbar-chips">
        <div ref={group} role="group" aria-label="Show" className={`${DOCK} relative`}>
          {tags.map((option) => {
            const pressed = tag === option.id
            // Until the pill is placed, the pressed chip draws itself as picked. Under the pill, it has
            // no line round it to show at the pill's edge.
            const look = !pressed ? "text-ink hover:bg-ink/[0.06]" : placed ? "text-ink" : "ink-glass"
            return (
              <button
                key={option.id}
                type="button"
                aria-pressed={pressed}
                onClick={() => onTag(option.id)}
                className={`${TAG} transition-[background-color,box-shadow] duration-200 motion-reduce:transition-none ${look}`}
              >
                {option.name}{" "}
                <span className={`font-mono text-[11px] ${pressed && !placed ? "text-white/70" : "text-ink-2"}`}>{option.count}</span>
              </button>
            )
          })}
          {/* Each chip in the copy is ink glass over the copy's ink, so the one the cut shows has its own gloss. */}
          <div
            ref={pill}
            aria-hidden="true"
            className={`${SLIDING_PILL} inset-0 flex flex-wrap items-center gap-1 p-1 ${placed ? "" : "invisible"}`}
          >
            {tags.map((option) => (
              <span key={option.id} className={`${TAG} ink-glass`}>
                {option.name} <span className="font-mono text-[11px] text-white/70">{option.count}</span>
              </span>
            ))}
          </div>
        </div>
      </div>
      <div className="dash-toolbar-controls">
        <div className={DOCK}>
          <SortMenu sort={sort} onSort={onSort} />
          {/* Left and right switch between the two, as the editor's Write / Check / Style do. Only the
            chosen one is in the Tab order, so focus is always on the white pill and needs no ring. */}
          <div
            role="group"
            aria-label="View"
            onKeyDown={(event) => {
              if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return
              event.preventDefault()
              const next = view === "pages" ? "list" : "pages"
              onView(next)
              event.currentTarget.querySelector<HTMLElement>(`[data-view="${next}"]`)?.focus()
            }}
            className="inline-flex h-9 rounded-full bg-ink/[0.06] p-[3px]"
          >
            <ViewButton
              view="pages"
              pressed={view === "pages"}
              onClick={() => onView("pages")}
              icon={<LayoutGrid className="h-3.5 w-3.5" aria-hidden="true" />}
            >
              Pages
            </ViewButton>
            <ViewButton
              view="list"
              pressed={view === "list"}
              onClick={() => onView("list")}
              icon={<List className="h-3.5 w-3.5" aria-hidden="true" />}
            >
              List
            </ViewButton>
          </div>
        </div>
      </div>
    </div>
  )
}

/** A pill saying how the resumes are sorted, which opens a menu of the other ways. */
function SortMenu({ sort, onSort }: { sort: Sort; onSort: (sort: Sort) => void }) {
  const { open, setOpen, button, menu, close, onKeyDown } = useMenu()
  const id = useId()
  const current = SORTS.find((option) => option.id === sort) ?? SORTS[0]
  return (
    <div className="relative">
      <button
        ref={button}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen((open) => !open)}
        className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm text-ink transition-colors duration-200 hover:bg-ink/[0.06] motion-reduce:transition-none"
      >
        <span className="text-ink-2">Sort</span> {current.name}
        <ChevronDown
          className={`h-3.5 w-3.5 text-ink-2 transition-transform duration-200 motion-reduce:transition-none ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>
      {open && (
        <div
          ref={menu}
          id={id}
          role="menu"
          aria-label="Sort by"
          onKeyDown={onKeyDown}
          className={`${MENU_PANEL} sort-menu right-0 top-full mt-2`}
        >
          {SORTS.map((option) => (
            <button
              key={option.id}
              type="button"
              role="menuitemradio"
              aria-checked={option.id === sort}
              tabIndex={-1}
              onClick={() => {
                close(true)
                onSort(option.id)
              }}
              className={`${MENU_ITEM} text-ink`}
            >
              <Check className={`h-4 w-4 ${option.id === sort ? "" : "invisible"}`} aria-hidden="true" />
              {option.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function ViewButton({
  view,
  pressed,
  onClick,
  icon,
  children,
}: {
  view: View
  pressed: boolean
  onClick: () => void
  icon: ReactNode
  children: ReactNode
}) {
  return (
    <button
      type="button"
      data-view={view}
      aria-pressed={pressed}
      tabIndex={pressed ? 0 : -1}
      onClick={onClick}
      className={`inline-flex h-full items-center gap-1.5 rounded-full px-3 text-sm transition-[background-color,color,box-shadow] duration-200 focus-visible:outline-none motion-reduce:transition-none ${
        pressed ? "bg-sheet text-ink shadow-[0_1px_3px_rgb(17_19_24/0.14)]" : "text-ink-2 hover:text-ink"
      }`}
    >
      {icon}
      {children}
    </button>
  )
}
