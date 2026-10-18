import type { Finding } from "@/lib/check/engine"
import { describePlace } from "@/lib/check/labels"
import type { ResumeView } from "@/lib/check/resume"
import { LEVELS } from "@/lib/check/settings"

const DOT = { fix: "bg-alert", look: "bg-caution", advice: "bg-accent" }

/** What the checker found, numbered as the marks on the pages are: where, what, why, and what to write instead. */
export default function Notes({ view, findings }: { view: ResumeView; findings: readonly Finding[] }) {
  return (
    <ol className="flex flex-col gap-3">
      {findings.map((finding, index) => {
        const kind = finding.advisory ? "advice" : finding.level
        return (
          <li
            key={finding.key}
            className="flex gap-3 rounded-[20px] bg-white p-4 shadow-[0_0_0_1px_#eceef2,0_12px_30px_-22px_rgb(30_60_130/0.35)]"
          >
            <span
              aria-hidden="true"
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink text-[12px] font-semibold text-white"
            >
              {index + 1}
            </span>
            <div className="flex min-w-0 flex-col gap-1">
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-ink-3">
                <span className="inline-flex items-center gap-1.5 font-medium text-ink-2">
                  <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${DOT[kind]}`} />
                  {kind === "advice" ? "Advice" : LEVELS[kind].name}
                </span>
                <span aria-hidden="true">·</span>
                <span className="min-w-0 break-words">{describePlace(view, finding.place)}</span>
              </p>
              <p className="text-[15px] font-medium leading-snug text-ink">{finding.message}</p>
              <p className="text-[14px] leading-snug text-ink-2">{finding.why}</p>
              {finding.suggestion && <p className="text-[14px] leading-snug text-accent">{finding.suggestion}</p>}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
