import Image from "next/image"
import Link from "next/link"
import type React from "react"
import { StartWritingLink } from "@/components/site/StartWriting"
import ArrowUpRight from "./ArrowUpRight"

// Each step's picture: the real screen it's about, cropped from the editor at
// 2x and saved at most 960px wide. Retake them when that part of the editor changes.
const STEPS: {
  word: string
  text: string
  art: { src: string; width: number; height: number; position: string }
  to: "templates" | "writing"
}[] = [
  {
    word: "Pick",
    // No count: it changes as templates are added.
    text: "Choose a template. Switch any time; your words stay put.",
    art: { src: "/how-it-works/pick-screen.webp", width: 960, height: 960, position: "object-top" },
    to: "templates",
  },
  {
    word: "Write",
    text: "Type beside a live page. Start from scratch, or open the PDF or Word resume you already have.",
    // Narrower than the picture on phones: the form, where you type, stays in sight.
    art: { src: "/how-it-works/write-screen.webp", width: 960, height: 601, position: "object-left-top" },
    to: "writing",
  },
  {
    word: "Send",
    text: "Download an ATS-friendly PDF so hiring software can read every word.",
    art: { src: "/how-it-works/send-screen.webp", width: 760, height: 920, position: "object-top" },
    to: "writing",
  },
]

// What turns white as blue fills the row (.step-row in home.css).
const ON_FILL = "transition-colors duration-300 group-hover:text-white group-focus-visible:text-white motion-reduce:transition-none"

function StepLink({ to, className, children }: { to: (typeof STEPS)[number]["to"]; className: string; children: React.ReactNode }) {
  if (to === "templates")
    return (
      <Link href="/templates" className={className}>
        {children}
      </Link>
    )
  return (
    <StartWritingLink className={className} preloadOnHover>
      {children}
    </StartWritingLink>
  )
}

/**
 * The steps as a contents page: one white sheet, a row for each step, each a
 * link to where that step starts. On phones the picture sits beside the words;
 * from lg, each row is one line.
 */
export default function HowItWorks() {
  return (
    <section aria-labelledby="how" data-tone="light" data-tick className="desk px-3 pb-16 pt-8 md:px-10 md:pb-24 md:pt-10">
      <div className="bg-sheet px-5 pt-6 md:px-11 md:pt-10">
        <div className="flex flex-wrap items-baseline justify-between gap-x-10 gap-y-3 border-b-[1.5px] border-ink pb-5 md:pb-6">
          <h2 id="how" className="label-section text-accent">
            How it works
          </h2>
          <p className="label-mono text-ink-2">From a blank page to a finished PDF</p>
        </div>

        {/* role="list": WebKit drops the list from screen readers once its numbers are styled away. */}
        <ol role="list">
          {STEPS.map((step, index) => (
            <li key={step.word} className="border-b border-rule last:border-b-0">
              <StepLink
                to={step.to}
                className="step-row group -mx-5 grid grid-cols-[minmax(0,1fr)_minmax(0,44%)] gap-x-4 gap-y-3 px-5 py-6 md:-mx-11 md:gap-x-8 md:px-11 md:py-8 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)_minmax(0,300px)_28px] lg:items-center"
              >
                <span className="col-start-1 row-start-1 flex items-baseline gap-4 lg:col-auto lg:row-auto lg:gap-7">
                  {/* The list numbers the steps for screen readers. */}
                  <span aria-hidden="true" className={`font-mono text-[13px] tracking-[0.08em] text-accent ${ON_FILL}`}>
                    0{index + 1}
                  </span>
                  <span className="font-serif text-[44px] leading-[0.92] tracking-[-0.04em] md:text-[72px] lg:text-[96px]">
                    {step.word}
                  </span>
                </span>
                <span
                  className={`col-start-1 row-start-2 max-w-[440px] text-base leading-[1.35] tracking-[-0.015em] text-ink-2 md:text-xl lg:col-auto lg:row-auto ${ON_FILL}`}
                >
                  {step.text}
                </span>
                <span className="col-start-2 row-span-3 row-start-1 h-[120px] overflow-hidden bg-white shadow-[0_0_0_1px_rgb(17_19_24/0.1)] md:h-[170px] lg:col-auto lg:row-auto lg:h-[180px]">
                  <Image
                    src={step.art.src}
                    alt=""
                    width={step.art.width}
                    height={step.art.height}
                    sizes="(min-width: 1024px) 300px, 44vw"
                    className={`h-full w-full object-cover ${step.art.position}`}
                  />
                </span>
                <span className="col-start-1 row-start-3 inline-flex h-7 w-7 items-center justify-center self-end bg-accent text-white transition-colors duration-300 group-hover:bg-white group-hover:text-accent group-focus-visible:bg-white group-focus-visible:text-accent motion-reduce:transition-none lg:col-auto lg:row-auto lg:self-center">
                  <ArrowUpRight />
                </span>
              </StepLink>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
