import EmailContact from "@/components/site/EmailContact"
import PageIntro from "@/components/site/PageIntro"
import { PromiseSection } from "@/components/site/PromisePage"
import SiteFooter from "@/components/site/SiteFooter"
import SiteHeader from "@/components/site/SiteHeader"
import { PAPER_FRAME, SHEET, TEXT_LINK } from "@/components/site/sheet"
import { CONTACT_EMAIL } from "@/lib/contact"
import { pageMetadata, REPO_URL } from "@/lib/site"

export const metadata = pageMetadata({
  path: "/contact",
  title: "Contact",
  description: `Found a bug in resumezip, or have an idea for it? Write to ${CONTACT_EMAIL}. Every message is read.`,
})

export default function Contact() {
  return (
    <div className="desk desk-bright flex min-h-screen flex-col">
      <SiteHeader />
      <div className={PAPER_FRAME}>
        <main className={`${SHEET} flex flex-col gap-16`}>
          <PageIntro
            label="Contact"
            title={
              <>
                Found a bug, or <em className="text-accent sm:whitespace-nowrap">have an idea?</em>
              </>
            }
          >
            <p className="text-pretty">Write to me. I read every message.</p>
            <div className="mt-7">
              <EmailContact />
            </div>
          </PageIntro>

          <PromiseSection id="bugs" heading="Telling me about a bug">
            <p>Say what you did, what happened, and which browser you were in. A screenshot helps.</p>
            <p>Your resume is only in your browser, so I can’t see it. Send it only if you want me to look at it.</p>
            <p>
              resumezip is open source, so you can also{" "}
              <a href={`${REPO_URL}/issues`} className={TEXT_LINK}>
                open an issue on GitHub
              </a>
              .
            </p>
          </PromiseSection>
        </main>
      </div>
      <SiteFooter />
    </div>
  )
}
