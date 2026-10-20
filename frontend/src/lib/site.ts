import type { Metadata } from "next"

/** The live site. Metadata, the sitemap and robots.txt give addresses on it, wherever the build runs. */
export const SITE_URL = "https://www.tryresumezip.com"

export const SITE_NAME = "resumezip"

export const REPO_URL = "https://github.com/ian-hoang/resumezip"
export const LINKEDIN_URL = "https://www.linkedin.com/company/resumezip"

/** The logo as a picture, for search engines: Google wants one at least 112 px square, which logo.svg doesn't say it is. */
export const LOGO_IMAGE = { url: "/logo.png", width: 1024, height: 1024 }

/**
 * Everything that goes online from a visitor's browser, as the privacy policy
 * and the private page both say it. Anything new that sends what someone
 * writes elsewhere changes this sentence, and so both pages.
 */
export const WHAT_GOES_ONLINE =
  "Your browser only goes online to load the site and its tools (our host and jsDelivr keep basic logs), look up a paper’s DOI you add, save a PDF to your own Google Drive when you ask, or get AI notes for a resume you review on the review page or ask about in the editor. AI notes send your resume’s text to Claude Sonnet 5.5, run by Anthropic, or to GPT-5.4 mini, run by OpenAI or Microsoft Azure, and we don’t keep it. They also send a random number for your browser, so we can limit how often one browser asks; we don’t keep that either."

/** What search results and link previews say about resumezip, unless a page says something of its own. */
export const SITE_DESCRIPTION = "Free, open-source resume builder that runs in your browser."

/** The home page's title, and the one shown for pages that don't set their own. */
export const HOME_TITLE = "resumezip: Free, private, open-source resume builder"

/** Other pages set a short title, e.g. "Templates" becomes "Templates · resumezip". */
export const TITLE_TEMPLATE = `%s · ${SITE_NAME}`

/** The size of a shared link's picture, which link previews show at 1.91:1. */
export const SHARE_IMAGE_SIZE = { width: 1200, height: 630 }

/** A picture a shared link shows. */
export interface ShareImage {
  url: string
  width: number
  height: number
  alt: string
}

/** The picture a link to the site shows when it's shared. */
export const SHARE_IMAGE: ShareImage = {
  // The logo's key drawn as a zipper, with the home page headline.
  url: "/og.png",
  ...SHARE_IMAGE_SIZE,
  alt: "resumezip: Your resume. Not our data.",
}

interface PageInfo {
  /** Where the page is, e.g. "/templates". */
  path: string
  /** The page's short title, which TITLE_TEMPLATE completes. Left out on the home page, which uses HOME_TITLE. */
  title?: string
  description: string
  /** The picture a shared link to the page shows, when it has one of its own: SHARE_IMAGE otherwise. */
  image?: ShareImage
}

/**
 * The metadata of a page people land on: its title and description for search
 * results and link previews, and its own address as the one to list it under.
 * Next gives a page that doesn't set `openGraph` its parent's whole, so without
 * this a shared link to any page previews as the home page. Not for a layout:
 * every page under it would claim the layout's address.
 */
export function pageMetadata({ path, title, description, image = SHARE_IMAGE }: PageInfo): Metadata {
  const shown = title === undefined ? HOME_TITLE : TITLE_TEMPLATE.replace("%s", title)
  return {
    ...(title !== undefined && { title }),
    description,
    alternates: { canonical: path },
    // X's card takes its title, description and picture from these.
    openGraph: { title: shown, description, url: path, siteName: SITE_NAME, images: [image], type: "website" },
  }
}
