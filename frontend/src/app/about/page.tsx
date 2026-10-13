import Image from "next/image"
import { Star } from "lucide-react"
import EmailContact from "@/components/site/EmailContact"
import { INK_GLASS_PILL } from "@/components/pills"
import SiteFooter from "@/components/site/SiteFooter"
import SiteHeader from "@/components/site/SiteHeader"
import { SHEET } from "@/components/site/sheet"
import { pageMetadata } from "@/lib/site"

export const metadata = pageMetadata({
  path: "/about",
  title: "About",
  description: "Who makes resumezip, what it promises, how your PDF is made in your own browser, and how to get in touch.",
})

const REPO_URL = "https://github.com/ian-hoang/resumezip"
const ISSUES_URL = `${REPO_URL}/issues`
const LINKEDIN_URL = "https://www.linkedin.com/company/resumezip"

const SECTION = "mt-16 grid gap-6 border-t border-ink pt-6 md:grid-cols-3 md:gap-12"
const HEADING = "font-serif text-[28px] leading-[1.15] tracking-[-0.02em] md:text-[32px]"
const TEXT_LINK = "text-ink underline underline-offset-4 hover:decoration-2"

// What resumezip holds to. Each has to stay true of the app: check the code before changing one.
const PROMISES = [
  { title: "Free", text: "Every template and download. No ads, no paid plans." },
  { title: "Private", text: "Your resume stays in your browser. No account, no copy." },
  { title: "Open source", text: "All of the code is on GitHub, for anyone to check." },
]

const MICROSOFT_STARTUPS_URL = "https://www.microsoft.com/en-us/startups"

/** Microsoft's four squares, in its colors. */
function MicrosoftLogo() {
  return (
    <svg viewBox="0 0 23 23" className="h-5 w-5 shrink-0" aria-hidden="true">
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

// The resume standing out of a manila folder, all as shares of the figure's width.
// The folder is a photo with a band of its plain middle taken out, so it's shorter.
const FOLDER = { src: "/about/manila-folder.webp", width: 1041, height: 640 }
const FOLDER_HEIGHT = FOLDER.height / FOLDER.width
// The front flap's top edge in the folder picture, measured from it, as a share of its height.
const FLAP_EDGE = 79 / FOLDER.height
// The page sits in the middle of the folder. Only its top stands out of it, so
// it's no taller than it needs to be to stay inside.
const PAGE = { width: 0.79, height: 0.58 }
// How far the page stands out above the folder: enough for everything written on it.
const FOLDER_TOP = 0.368
const FIGURE_HEIGHT = FOLDER_TOP + FOLDER_HEIGHT
const down = (share: number) => `${(100 * share) / FIGURE_HEIGHT}%`

/**
 * resumezip introduced as it'd introduce anyone: its own resume, in Jake's
 * template, rising out of a folder as the page scrolls (`.folder-rise` and
 * `.about-pin-held` in styles/home.css), tilted a little and held by a paper clip. The page is a real
 * render of `own-resume.json`, cropped under its last line (the rest of the
 * sheet is plain white), so print it again when a line changes. Each line has
 * to stay true of the app, as the promises do. The folder is drawn twice, the
 * second time only from the front flap's edge down, so the page goes into it.
 */
// A paper clip's one wire, drawn as two parts: the outer loop on the front of the
// page, and the inner one behind it, which only shows above the page's edge.
const CLIP_WIRE = {
  front: "M18 24 L18 54 A8 8 0 0 1 2 54 L2 10 A6.75 6.75 0 0 1 15.5 10",
  back: "M15.5 10 L15.5 48 A4 4 0 0 1 7.5 48 L7.5 20",
}

/** Half of a steel paper clip over the page's top edge, which crosses it 18 units down. */
function PaperClip({ part }: { part: keyof typeof CLIP_WIRE }) {
  return (
    <svg
      viewBox="0 0 20 64"
      aria-hidden="true"
      className={`absolute left-[10%] top-0 w-[5.5%] -translate-y-[28%] overflow-visible ${
        part === "front" ? "z-10 drop-shadow-[0.5px_1px_0.75px_rgb(17_19_24/0.35)]" : ""
      }`}
    >
      <defs>
        <linearGradient id={`clip-steel-${part}`} x1="0" x2="20" y1="0" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#6f757c" />
          <stop offset="0.3" stopColor="#eef0f2" />
          <stop offset="0.55" stopColor="#858b91" />
          <stop offset="0.8" stopColor="#f6f7f8" />
          <stop offset="1" stopColor="#6f757c" />
        </linearGradient>
      </defs>
      <path d={CLIP_WIRE[part]} fill="none" stroke={`url(#clip-steel-${part})`} strokeWidth="2.4" strokeLinecap="round" />
      <path d={CLIP_WIRE[part]} fill="none" stroke="#fff" strokeOpacity="0.55" strokeWidth="0.5" strokeLinecap="round" />
    </svg>
  )
}

function OwnResume() {
  const folder = "absolute left-0 w-full h-auto"
  const page = { left: `${(100 * (1 - PAGE.width)) / 2}%`, width: `${100 * PAGE.width}%` }
  return (
    <figure className="relative w-full max-w-[440px] xl:mr-24 xl:w-[410px]" style={{ aspectRatio: `1 / ${FIGURE_HEIGHT}` }}>
      <Image
        src={FOLDER.src}
        width={FOLDER.width}
        height={FOLDER.height}
        sizes="(min-width: 1280px) 410px, (min-width: 640px) 440px, 100vw"
        alt=""
        style={{ top: down(FOLDER_TOP) }}
        className={`${folder} drop-shadow-[0_24px_32px_rgb(30_40_90/0.28)]`}
        priority
      />
      <div style={{ ...page, top: 0, height: down(PAGE.height) }} className="folder-rise absolute rotate-2">
        <PaperClip part="back" />
        <div className="relative h-full bg-white shadow-[0_1px_3px_rgb(17_19_24/0.12)]">
          <Image
            src="/about/own-resume.webp"
            width={1280}
            height={764}
            sizes="(min-width: 1280px) 324px, (min-width: 640px) 348px, 80vw"
            alt="resumezip’s own resume, in Jake’s template: a resume builder in your own browser since March 2025, with no account, that has kept 0 copies of anyone’s resume."
            className="h-auto w-full"
            priority
          />
        </div>
        <PaperClip part="front" />
      </div>
      {/* The flap's shadow on the page, just above its edge. */}
      <div
        style={{ ...page, top: `calc(${down(FOLDER_TOP + FLAP_EDGE * FOLDER_HEIGHT)} - 6px)` }}
        className="absolute h-1.5 bg-linear-to-t from-[rgb(80_55_20/0.18)] to-transparent"
      />
      <Image
        src={FOLDER.src}
        width={FOLDER.width}
        height={FOLDER.height}
        sizes="(min-width: 1280px) 410px, (min-width: 640px) 440px, 100vw"
        alt=""
        style={{ top: down(FOLDER_TOP), clipPath: `inset(${100 * FLAP_EDGE}% 0 0 0)` }}
        className={folder}
      />
    </figure>
  )
}

export default function AboutPage() {
  return (
    <div className="desk flex min-h-screen flex-col">
      <SiteHeader />
      {/* On a wide screen the whole page holds still while the resume rises, then scrolls on. */}
      <div className="flex flex-1 flex-col">
        <main className={`${SHEET} about-pin-held`}>
          <div className="grid items-center gap-10 xl:grid-cols-[minmax(0,1fr)_auto] xl:gap-12">
            <div className="flex flex-col gap-5">
              <span className="label-mono text-ink-2">About</span>
              <h1 className="font-serif text-5xl leading-[1.02] tracking-[-0.03em] md:text-[80px] md:leading-[0.95]">
                Here’s <em className="whitespace-nowrap text-accent">our resume.</em>
              </h1>
              <p className="max-w-[600px] text-[17px] leading-relaxed text-ink-2">
                Many resume builders charge you to download your own resume, and keep a copy. <Wordmark /> doesn’t: every template is free
                and made for the hiring software (ATS) that reads it, and your resume stays in your browser.
              </p>
              {/* One small badge of frosted glass, as the site's buttons are, rather than a logo wall. */}
              <a
                href={MICROSOFT_STARTUPS_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="glass glass-float mt-3 inline-flex self-start items-center gap-3.5 rounded-full py-3 pl-[18px] pr-[22px] transition-[filter] hover:brightness-[1.03]"
              >
                <span className="label-mono text-ink-2">Part of</span>
                <span aria-hidden="true" className="h-5 w-px bg-ink/15" />
                <MicrosoftLogo />
                <span className="font-serif text-[22px] leading-none tracking-[-0.01em]">Microsoft for Startups</span>
              </a>
            </div>
            <OwnResume />
          </div>

          <section className={SECTION} aria-labelledby="promises">
            <h2 id="promises" className={HEADING}>
              What it promises
            </h2>
            <ul className="grid gap-8 sm:grid-cols-3 md:col-span-2">
              {PROMISES.map((promise) => (
                <li key={promise.title} className="flex flex-col gap-2">
                  <span className="font-serif text-[22px] italic leading-tight text-accent">{promise.title}</span>
                  <span className="text-[15px] leading-relaxed text-ink-2">{promise.text}</span>
                </li>
              ))}
            </ul>
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
        </main>
        <div className="about-pin-room" />
      </div>
      <SiteFooter />
    </div>
  )
}
