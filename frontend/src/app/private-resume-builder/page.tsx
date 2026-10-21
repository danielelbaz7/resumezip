import Link from "next/link"
import PromisePage, { PromiseSection } from "@/components/site/PromisePage"
import { TEXT_LINK } from "@/components/site/sheet"
import { pageMetadata, WHAT_GOES_ONLINE } from "@/lib/site"

const PATH = "/private-resume-builder"
const NAME = "Private resume builder"

export const metadata = pageMetadata({
  path: PATH,
  title: NAME,
  description:
    "resumezip saves your resume in your browser and keeps no copy. No account, no ads and no trackers, and your PDF is made on your own computer.",
})

export default function Private() {
  return (
    <PromisePage
      path={PATH}
      name={NAME}
      heading={
        <>
          A resume builder that <em className="text-accent">doesn’t keep your resume</em>
        </>
      }
      intro="Your resume is saved in your browser as you type, and your PDF is made on your own computer. We keep no copy, and there are no ads or trackers."
      limits={[
        "It can’t get a resume back for you. We never had a copy, so a resume cleared from your browser is gone. Download a PDF of anything you want to keep.",
        "It doesn’t sync between devices. To carry on somewhere else, open your PDF there: it carries a copy of your resume.",
      ]}
      questions={[
        {
          question: "Do you use analytics or trackers?",
          answer: "No. There are no analytics, no ads and no trackers on resumezip.",
        },
        {
          question: "Does anyone at resumezip read my resume?",
          answer:
            "No. For AI notes, your resume’s text goes to the AI and isn’t kept. The checks in the editor’s Check tab run in your browser.",
        },
        {
          question: "What happens when I save to Google Drive?",
          answer: "Google asks you first, then your browser puts the PDF in your own Drive. resumezip keeps no copy of it.",
        },
      ]}
    >
      <PromiseSection id="where" heading="Where your resume is">
        <p>
          In your browser’s storage, on your device, saved as you type. Your PDF is made there too, so there’s no copy of your resume on our
          side to leak, sell or hand over.
        </p>
        <p>
          The{" "}
          <Link href="/review" className={TEXT_LINK}>
            review page
          </Link>{" "}
          reads your file in your browser too, and keeps it there so you can open its review again. Only its text goes to the AI for its
          notes, and the AI doesn’t keep it.
        </p>
      </PromiseSection>

      <PromiseSection id="online" heading="What does go online">
        <p>{WHAT_GOES_ONLINE}</p>
        <p>Apart from those, nothing you write is sent anywhere.</p>
      </PromiseSection>

      <PromiseSection id="check" heading="Check it yourself">
        <p>
          Open your browser’s developer tools and choose Network, then write. You’ll see the site and its tools load, and nothing go out
          with what you typed until you ask for AI notes. Under Application in Chrome, or Storage in Firefox and Safari, Local storage holds
          your resumes, each under “resume:” and an id, and IndexedDB holds the files you’ve reviewed.
        </p>
        <p>
          Or read the code:{" "}
          <Link href="/open-source-resume-builder" className={TEXT_LINK}>
            resumezip is open source
          </Link>
          .
        </p>
      </PromiseSection>
    </PromisePage>
  )
}
