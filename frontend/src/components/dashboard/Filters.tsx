"use client"

import { Check, ChevronDown, LayoutGrid, List } from "lucide-react"
import { useId, type ReactNode } from "react"
import { MENU_ITEM, MENU_PANEL, useMenu } from "./MoreMenu"
import { FILTER_CHIP, GLASS_BAR } from "@/components/pills"
import { SLIDING_PILL, useSlidingPill } from "@/components/useSlidingPill"

export type View = "pages" | "list"
export type Sort = "edited" | "name"

const TAG = FILTER_CHIP

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
    // One glass bar, as on the templates page (dashboard.css lays out what's in it).
    <div className={`dash-toolbar ${GLASS_BAR}`}>
      <div className="dash-toolbar-search">{search}</div>
      <div className="dash-toolbar-chips">
        {/* One line that scrolls sideways where it's too narrow, as the templates page's styles do. */}
        <div
          ref={group}
          role="group"
          aria-label="Show"
          className="relative flex min-w-0 gap-0.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {tags.map((option) => {
            const pressed = tag === option.id
            // Until the pill is placed, the pressed chip draws itself as picked. Under the pill, it has
            // no line round it to show at the pill's edge.
            const look = !pressed ? "text-ink hover:bg-ink/[0.06]" : placed ? "text-ink" : "bg-ink text-white"
            return (
              <button
                key={option.id}
                type="button"
                aria-pressed={pressed}
                onClick={() => onTag(option.id)}
                className={`${TAG} transition-[background-color,box-shadow] duration-200 motion-reduce:transition-none ${look}`}
              >
                {option.name}{" "}
                <span className={`font-mono text-[11px] font-normal ${pressed && !placed ? "text-white/70" : "text-ink-2"}`}>
                  {option.count}
                </span>
              </button>
            )
          })}
          <div ref={pill} aria-hidden="true" className={`${SLIDING_PILL} flex w-max min-w-full gap-0.5 ${placed ? "" : "invisible"}`}>
            {tags.map((option) => (
              <span key={option.id} className={TAG}>
                {option.name} <span className="font-mono text-[11px] font-normal text-white/70">{option.count}</span>
              </span>
            ))}
          </div>
        </div>
      </div>
      <div className="dash-toolbar-controls">
        <div className="flex items-center gap-1">
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
        className="inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-4 text-[15px] text-ink transition-colors duration-200 hover:bg-ink/[0.06] motion-reduce:transition-none"
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
      className={`inline-flex h-full items-center gap-1.5 rounded-full px-3.5 text-[15px] transition-[background-color,color,box-shadow] duration-200 focus-visible:outline-none motion-reduce:transition-none ${
        pressed ? "bg-sheet text-ink shadow-[0_1px_3px_rgb(17_19_24/0.14)]" : "text-ink-2 hover:text-ink"
      }`}
    >
      {icon}
      {/* Said, but not shown, on phones, where the bar's last line has room only for the icons. */}
      <span className="max-sm:sr-only">{children}</span>
    </button>
  )
}
