import { Caveat, Dawning_of_a_New_Day } from "next/font/google"
import { Star } from "lucide-react"
import AboutStory from "@/components/about/AboutStory"
import LiquidLens from "@/components/LiquidLens"
import EmailContact from "@/components/site/EmailContact"
import { INK_GLASS_PILL } from "@/components/pills"
import SiteFooter from "@/components/site/SiteFooter"
import SiteHeader from "@/components/site/SiteHeader"
import { SHEET } from "@/components/site/sheet"
import { LINKEDIN_URL, pageMetadata, REPO_URL } from "@/lib/site"

export const metadata = pageMetadata({
  path: "/about",
  title: "About",
  description: "Who makes resumezip, what it promises, how your PDF is made in your own browser, and how to get in touch.",
})

const ISSUES_URL = `${REPO_URL}/issues`

const SECTION = "mt-16 grid gap-6 border-t border-ink pt-6 first:mt-0 md:grid-cols-3 md:gap-12"
const HEADING = "font-serif text-[28px] leading-[1.15] tracking-[-0.02em] md:text-[32px]"
const TEXT_LINK = "text-ink underline underline-offset-4 hover:decoration-2"

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

/** GitHub's mark, in the text's color. */
function GitHubLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M12 .5C5.65.5.5 5.65.5 12a11.5 11.5 0 0 0 7.86 10.92c.58.1.79-.25.79-.56v-2c-3.2.7-3.87-1.37-3.87-1.37-.52-1.33-1.28-1.69-1.28-1.69-1.04-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.76 2.7 1.25 3.36.96.1-.75.4-1.25.73-1.54-2.56-.29-5.25-1.28-5.25-5.69 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.84 1.19 3.1 0 4.42-2.7 5.4-5.27 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z" />
    </svg>
  )
}

/** "resumezip" in running text, in the logo's own lettering at the text's size. */
function Wordmark() {
  return <span className="font-logo font-medium tracking-[-0.02em] text-ink">resumezip</span>
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
        <div className={SHEET}>
          {/* What resumezip is, in plain facts that search engines and AI answers can quote. Each has to stay true of the app. */}
          <section className={SECTION} aria-labelledby="does">
            <h2 id="does" className={HEADING}>
              What it does
            </h2>
            <div className="md:col-span-2">
              <p className="max-w-2xl text-[17px] leading-relaxed text-ink-2">
                <Wordmark /> is a free, open-source resume builder (MIT license) that runs in your browser. You fill in a form and see the
                page as you type, and it checks your resume as you write. Download it as a PDF, a Word file, a LaTeX file for Overleaf or
                JSON, or save the PDF to Google Drive. It opens resumes from PDF, Word and JSON files, and prints on US Letter or A4.
                There’s no account, and <Wordmark /> keeps your resume only in your browser: a copy goes anywhere else only when you
                download or save one.
              </p>
            </div>
          </section>

          <section className={SECTION} aria-labelledby="made">
            <h2 id="made" className={HEADING}>
              How it’s made
            </h2>
            <div className="md:col-span-2">
              <p className="max-w-2xl text-[17px] leading-relaxed text-ink-2">
                Your PDF is typeset by Typst, running in your own browser, so your resume never has to be sent anywhere to become a page.
                The PDF carries your resume inside it, which is how resumezip opens it again on any computer.
              </p>
            </div>
          </section>

          {/* Where Contact used to be: /contact comes here. */}
          <section id="contact" className={`${SECTION} scroll-mt-28`} aria-labelledby="contact-heading">
            <div className="flex flex-col gap-3">
              <h2 id="contact-heading" className={HEADING}>
                Get in touch
              </h2>
              <p className="text-[15px] leading-relaxed text-ink-2">Found a bug or have an idea? I read every message.</p>
            </div>
            <div className="flex flex-col gap-5 md:col-span-2">
              <EmailContact />
              <p className="flex flex-wrap gap-x-6 gap-y-2 text-[15px]">
                <a href={ISSUES_URL} target="_blank" rel="noopener noreferrer" className={TEXT_LINK}>
                  Report a bug on GitHub
                </a>
                <a href={LINKEDIN_URL} target="_blank" rel="noopener noreferrer" className={TEXT_LINK}>
                  Find us on LinkedIn
                </a>
              </p>
            </div>
          </section>

          <section className={SECTION}>
            <h2 className={`${HEADING} flex items-center gap-3 self-start`}>
              <GitHubLogo className="h-7 w-7 shrink-0 md:h-8 md:w-8" />
              Star it on GitHub
            </h2>
            <div className="md:col-span-2">
              <p className="max-w-2xl text-[17px] leading-relaxed text-ink-2">
                No ads, no paid plans. If <Wordmark /> helped you, a star helps others find it.
              </p>
              <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className={`${INK_GLASS_PILL} mt-6`}>
                {/* Gold, as the header's star is. */}
                <Star className="h-4 w-4 fill-[#facc15] text-[#facc15]" aria-hidden="true" />
                Star on GitHub
              </a>
            </div>
          </section>
        </div>
      </main>
      <SiteFooter />
    </div>
  )
}
