import ReviewPage from "@/components/review/ReviewPage"
import { pageMetadata } from "@/lib/site"

export const metadata = pageMetadata({
  path: "/review",
  title: "Review your resume",
  description:
    "Drop your resume and see what a recruiter would skip, marked right on the page, with a score out of 100. Free, and read in your browser.",
})

export default function Review() {
  return <ReviewPage />
}
