import { Caveat, Dawning_of_a_New_Day } from "next/font/google"
import AboutStory from "@/components/about/AboutStory"
import LiquidLens from "@/components/LiquidLens"
import SiteFooter from "@/components/site/SiteFooter"
import SiteHeader from "@/components/site/SiteHeader"
import { pageMetadata } from "@/lib/site"

export const metadata = pageMetadata({
  path: "/about",
  title: "About",
  description: "What resumezip is and what it promises: free, private and open source, with your resume kept on your own computer.",
})

const MICROSOFT_STARTUPS_URL = "https://www.microsoft.com/en-us/startups"

/** Microsoft's four squares, in its colors. */
function MicrosoftLogo() {
  return (
    <svg viewBox="0 0 23 23" className="h-4 w-4 shrink-0" aria-hidden="true">
      <path fill="#f25022" d="M1 1h10v10H1z" />
      <path fill="#7fba00" d="M12 1h10v10H12z" />
      <path fill="#00a4ef" d="M1 12h10v10H1z" />
      <path fill="#ffb900" d="M12 12h10v10H12z" />
    </svg>
  )
}

// The handwriting on the story's folder and in the notes beside our resume. Only this page uses
// them, and they're first seen a few screens down, so they aren't preloaded.
const pen = Dawning_of_a_New_Day({ weight: "400", variable: "--font-pen", preload: false })
const marker = Caveat({ weight: "600", subsets: ["latin"], variable: "--font-caveat", preload: false })

/** The first screen: the name as the logo writes it, what it is, as a dictionary would say, and Microsoft for Startups. */
function Hero() {
  return (
    <>
      <p className="label-mono text-ink-2">About</p>
      <h1 className="story-wordmark">resumezip</h1>
      <p className="story-entry">
        <b className="font-serif text-2xl font-semibold tracking-[-0.01em]">re·su·me·zip</b>
        <span className="font-mono text-[15px] text-ink-2">\ rez-uh-may-zip \</span>
        <i className="font-serif text-2xl text-ink-2">noun</i>
      </p>
      <p className="story-definition">
        A free, open-source resume builder that runs in your browser, and keeps your resume on{" "}
        <em className="text-accent">your own computer.</em>
      </p>
      {/* One slim pill of glass, rather than a logo wall. */}
      <a
        href={MICROSOFT_STARTUPS_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="story-partner glass glass-float transition-[filter] hover:brightness-[1.03]"
      >
        <LiquidLens bevel={18} strength={1} />
        <span className="label-mono text-ink-2">Part of</span>
        <span aria-hidden="true" className="h-[18px] w-px bg-ink/15" />
        <MicrosoftLogo />
        <span className="whitespace-nowrap font-serif text-[17px] leading-none tracking-[-0.01em] sm:text-[19px]">
          Microsoft for Startups
        </span>
      </a>
    </>
  )
}

export default function AboutPage() {
  return (
    <div className="desk flex min-h-screen flex-col">
      <SiteHeader />
      {/* A column, so the story's pull up behind the header doesn't move the main part with it. */}
      <main className={`flex flex-1 flex-col ${pen.variable} ${marker.variable}`}>
        <AboutStory hero={<Hero />} />
      </main>
      <SiteFooter />
    </div>
  )
}
