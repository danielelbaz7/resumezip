import type React from "react"

interface PageIntroProps {
  /** Small mono label above the title, as "Why resumezip". */
  label: string
  title: React.ReactNode
  children: React.ReactNode
}

/** The title block at the top of content pages. */
export default function PageIntro({ label, title, children }: PageIntroProps) {
  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <span className="label-mono text-ink-2">{label}</span>
      <h1 className="font-serif text-5xl leading-[1.02] tracking-[-0.025em] md:text-[64px]">{title}</h1>
      <div className="text-[17px] leading-relaxed text-ink-2">{children}</div>
    </div>
  )
}
