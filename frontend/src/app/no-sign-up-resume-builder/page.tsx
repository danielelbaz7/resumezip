import Link from "next/link"
import PromisePage, { PromiseSection, TEXT_LINK } from "@/components/site/PromisePage"
import { pageMetadata } from "@/lib/site"

const PATH = "/no-sign-up-resume-builder"
const NAME = "Free resume builder with no sign-up"

export const metadata = pageMetadata({
  path: PATH,
  title: NAME,
  description:
    "Write your resume and download the PDF with no account, no email and no card. resumezip saves it in your browser, so there’s nothing to sign up for.",
})

export default function NoSignUp() {
  return (
    <PromisePage
      path={PATH}
      name={NAME}
      heading={
        <>
          A resume builder with <em className="text-accent">no sign-up</em>
        </>
      }
      intro="Open it and start writing. There’s no account to make, no email to give and no card to enter, now or when you download your PDF."
      limits={[
        "It doesn’t sync. Your resumes are saved in the browser you wrote them in, and clearing its data deletes them, so download a PDF of anything you want to keep.",
        "It can’t get a resume back for you. With no account, there’s no copy on our side to restore.",
        "It doesn’t write cover letters.",
      ]}
      questions={[
        {
          question: "What’s the catch?",
          answer:
            "There isn’t one. resumezip is free and open source, with no ads and no paid plan. Your browser makes the PDF, not our servers.",
        },
        {
          question: "Can I come back and edit my resume later?",
          answer: "Yes. Open resumezip in the same browser and it’s on your dashboard, as you left it.",
        },
        {
          question: "Will my PDF have a watermark?",
          answer: (
            <>
              No.{" "}
              <Link href="/resume-builder-no-watermark" className={TEXT_LINK}>
                Nothing is printed on your PDF
              </Link>{" "}
              but what you wrote: no logo and no “made with” line.
            </>
          ),
        },
        {
          question: "Do I need a Google account to save to Google Drive?",
          answer:
            "Only for that. Save to Google Drive puts the PDF in your own Drive, and Google asks you first. Everything else works without it.",
        },
      ]}
    >
      <PromiseSection id="download" heading="When you download">
        <p>
          Press Download PDF and your PDF is saved. No box asks for your email first, and there’s no plan to pick. Your browser makes the
          PDF on your own computer, so there’s nothing on our side to unlock.
        </p>
        <p>Word, LaTeX and JSON downloads are free too, as many times as you like.</p>
      </PromiseSection>

      <PromiseSection id="why" heading="Why there’s no account">
        <p>
          An account is how a site keeps your resume on its servers. resumezip doesn’t keep it at all: it’s saved in your browser as you
          type. With nothing stored on our side, there’s nothing to sign in to.
        </p>
      </PromiseSection>

      <PromiseSection id="later" heading="On another computer">
        <p>
          Every PDF from resumezip carries a copy of your resume, so it opens again for editing. To carry on somewhere else, open your PDF
          there with Open a file on the dashboard. A Word or JSON file from resumezip opens the same way.
        </p>
      </PromiseSection>
    </PromisePage>
  )
}
