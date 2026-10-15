import Link from "next/link"
import FloatingStart from "@/components/home/FloatingStart"
import FocusWords from "@/components/home/FocusWords"
import HeroVideo from "@/components/home/HeroVideo"
import HomeChrome from "@/components/home/HomeChrome"
import CheckDemo from "@/components/home/CheckDemo"
import HowItWorks from "@/components/home/HowItWorks"
import PrefetchCompiler from "@/components/home/PrefetchCompiler"
import Questions from "@/components/home/Questions"
import StructuredData from "@/components/site/StructuredData"
import SiteFooter from "@/components/site/SiteFooter"
import { StartWritingLink } from "@/components/site/StartWriting"
import { pageMetadata, SITE_DESCRIPTION } from "@/lib/site"
import { HOME_DATA } from "@/lib/structuredData"

export const metadata = pageMetadata({ path: "/", description: SITE_DESCRIPTION })

function ArrowUpRight() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path d="M3 9l6-6M4 3h5v5" />
    </svg>
  )
}

// An outline pill on the video and the blue, which fills with white from the bottom as it's pointed at (home.css).
const OUTLINE_PILL =
  "ink-fill inline-flex h-11 items-center self-start rounded-full border px-[18px] text-[15px] font-medium tracking-[-0.01em]"

// Sections say what they're drawn on (data-tone), for the header's tint, and
// data-tick gives them a tick at the side of the page (HomeChrome.tsx).
export default function Home() {
  return (
    <div className="home relative flex flex-col bg-sheet text-ink">
      <StructuredData data={HOME_DATA} />
      <HomeChrome />

      <section
        data-hero
        data-tone="dark"
        data-tick
        className="home-hero relative flex min-h-[max(680px,100svh)] flex-col overflow-hidden bg-black text-white"
      >
        <HeroVideo />
        <div aria-hidden="true" className="absolute inset-0 bg-black/25" />
        {/* Shade on the left, where the text sits, so the clip's face on the right stays clear. Narrower screens show only
            the middle of the clip, with the face behind the text, so they're shaded more evenly instead. */}
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/65 to-black/45 lg:from-black/90 lg:via-black/50 lg:via-30% lg:to-transparent lg:to-[58%]"
        />
        {/* The video darkens to black at its foot, where the blue section after it fades in from black. */}
        <div aria-hidden="true" className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-b from-transparent to-black" />

        <div className="relative mx-auto w-full max-w-[1440px] px-5 md:px-10">
          <h1 className="font-serif text-[56px] leading-[0.92] tracking-[-0.045em] sm:text-[80px] lg:text-[96px] lg:leading-[0.88]">
            Your resume,
            <br />
            done <em className="pr-[0.04em] text-accent">right.</em>
          </h1>
        </div>

        <div className="relative mx-auto flex w-full max-w-[1440px] flex-1 flex-wrap items-end justify-between gap-8 px-5 pb-6 pt-12 md:px-10 md:pb-10">
          {/* The square box: the sentence, a rule, and Start writing in capitals beside a blue square arrow. */}
          <div className="flex w-full max-w-[420px] flex-col gap-7 bg-white px-7 pb-5 pt-7 text-ink">
            <p className="text-xl leading-[1.35] tracking-[-0.015em]">
              resumezip is a free, open-source resume builder that runs in your browser. Pick a template, write, and download the PDF.
            </p>
            <StartWritingLink className="group flex items-center justify-between gap-4 border-t border-ink pt-4" preloadOnHover>
              <span className="text-[13px] font-semibold uppercase tracking-[0.1em] decoration-2 underline-offset-4 group-hover:underline">
                Start writing
              </span>
              <span className="inline-flex h-7 w-7 items-center justify-center bg-accent text-white transition duration-200 group-hover:bg-[#2550d4] motion-safe:group-hover:-translate-y-0.5 motion-safe:group-hover:translate-x-0.5">
                <ArrowUpRight />
              </span>
            </StartWritingLink>
          </div>
          <div className="flex max-w-[340px] flex-col gap-4">
            <span className="label-mono">Free · Saved in your browser</span>
            <p className="text-xl leading-[1.35] tracking-[-0.015em]">Nothing to install. No sign-up.</p>
            <Link href="/templates" className={`${OUTLINE_PILL} border-white/70`}>
              <span className="ink-fill-label inline-flex items-center gap-2.5">
                See templates <ArrowUpRight />
              </span>
            </Link>
          </div>
        </div>
      </section>

      <section data-tone="blue" data-tick className="cloud-seam fade-from-black relative bg-accent text-white">
        <div className="flex flex-col gap-24 px-5 pb-24 pt-8 md:gap-[200px] md:px-10 md:pb-[120px]">
          {/* In capitals, as every section's title is here. */}
          <span className="label-section">Why resumezip</span>
          <div className="max-w-[760px]">
            <FocusWords
              lines={[
                {
                  text: "You keep it. We don’t.",
                  className: "font-serif text-5xl leading-[0.95] tracking-[-0.04em] md:text-[80px] md:leading-[0.92]",
                  from: 0,
                  to: 0.7,
                  // White at 70% on the blue is 3.6:1.
                  faint: 0.7,
                },
                {
                  // A beat behind the heading.
                  text: "No account, and no copy on our side. To switch devices, open your PDF, or a JSON backup, on the new one.",
                  className: "max-w-[520px] text-xl leading-[1.35] tracking-[-0.015em]",
                  from: 0.35,
                  to: 1,
                  // At 90%, 4.9:1.
                  faint: 0.9,
                },
              ]}
            >
              <StartWritingLink className={`${OUTLINE_PILL} border-white`} preloadOnHover>
                <span className="ink-fill-label inline-flex items-center gap-2.5">
                  Start writing <ArrowUpRight />
                </span>
              </StartWritingLink>
            </FocusWords>
          </div>
        </div>
      </section>

      <HowItWorks />

      <CheckDemo />

      <Questions />

      <SiteFooter />
      <FloatingStart />
      <PrefetchCompiler />
    </div>
  )
}
