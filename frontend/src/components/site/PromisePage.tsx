import type React from "react"
import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { INK_PILL } from "@/components/pills"
import PageIntro from "@/components/site/PageIntro"
import SiteFooter from "@/components/site/SiteFooter"
import SiteHeader from "@/components/site/SiteHeader"
import { StartWritingLink } from "@/components/site/StartWriting"
import StructuredData from "@/components/site/StructuredData"
import { HEADING, PAPER_FRAME, SECTION, SHEET, TEXT_LINK } from "@/components/site/sheet"
import { PROMISES } from "@/lib/promises"
import { breadcrumbs } from "@/lib/structuredData"

const PARAGRAPHS = "flex max-w-2xl flex-col gap-4 text-pretty text-[17px] leading-relaxed text-ink-2 md:col-span-2"

/** One part of a promise page: its heading beside its paragraphs. */
export function PromiseSection({ id, heading, children }: { id: string; heading: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className={SECTION}>
      <h2 id={id} className={HEADING}>
        {heading}
      </h2>
      <div className={PARAGRAPHS}>{children}</div>
    </section>
  )
}

interface PromisePageProps {
  /** The page's address, one of PROMISES'. */
  path: string
  /** The page's title in search results, which its breadcrumb repeats. */
  name: string
  heading: React.ReactNode
  intro: React.ReactNode
  /** How it's true: PromiseSections. */
  children: React.ReactNode
  /** What resumezip doesn't do that someone might expect it to, said plainly so the rest is believed. */
  limits: React.ReactNode[]
  questions: { question: string; answer: React.ReactNode }[]
}

/**
 * A page about one thing resumezip promises, for someone who searched for it,
 * often after another builder asked for an email or a card at Download: the
 * promise and Start writing, how it's true, what resumezip doesn't do, the
 * questions people ask, and the other promises.
 */
export default function PromisePage({ path, name, heading, intro, children, limits, questions }: PromisePageProps) {
  const others = PROMISES.filter((promise) => promise.path !== path)

  return (
    <div className="desk desk-bright flex min-h-screen flex-col">
      <SiteHeader />
      <StructuredData data={breadcrumbs([{ name, path }])} />

      <div className={PAPER_FRAME}>
        <main className={`${SHEET} flex flex-col gap-16`}>
          <PageIntro label="Why resumezip" title={heading}>
            <p className="text-pretty">{intro}</p>
            <StartWritingLink className={`${INK_PILL} mt-7`} preloadOnHover>
              Start writing <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </StartWritingLink>
          </PageIntro>

          {children}

          <PromiseSection id="limits" heading="What it doesn’t do">
            <ul className="flex list-disc flex-col gap-3 pl-5">
              {limits.map((limit, index) => (
                <li key={index}>{limit}</li>
              ))}
            </ul>
          </PromiseSection>

          <PromiseSection id="questions" heading="Questions">
            <dl className="flex flex-col gap-5">
              {questions.map(({ question, answer }) => (
                <div key={question} className="flex flex-col gap-1">
                  <dt className="font-medium text-ink">{question}</dt>
                  <dd>{answer}</dd>
                </div>
              ))}
            </dl>
          </PromiseSection>

          {others.length > 0 && (
            <PromiseSection id="more" heading="More reasons">
              <ul className="flex flex-col gap-3">
                {others.map((promise) => (
                  <li key={promise.path}>
                    <Link href={promise.path} className={TEXT_LINK}>
                      {promise.name}
                    </Link>
                    : {promise.summary}
                  </li>
                ))}
              </ul>
            </PromiseSection>
          )}
        </main>
      </div>
      <SiteFooter />
    </div>
  )
}
