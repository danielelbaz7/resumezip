import type { TemplateId } from "@/lib/templates"

// What each template's page says about it. Each is written for its template,
// from how its picture looks: pages that differ by a name read as copies to
// search engines. Keep every line true of the template's .typ file.

interface TemplateAbout {
  /** For search results: what it is and what you get, under about 160 characters. */
  description: string
  /** What it looks like, then who it suits. */
  text: readonly [string, string]
  /** First made in LaTeX, so its page says LaTeX isn't needed for it. */
  latex?: true
}

export const ABOUT: Record<TemplateId, TemplateAbout> = {
  jake: {
    description:
      "Jake’s resume template, the one-page LaTeX resume students and engineers use. Fill it in in your browser, no LaTeX or Overleaf needed, and download the PDF.",
    text: [
      "Jake’s is a one-page resume first written in LaTeX and shared on Overleaf, and a favorite of students and software engineers. It’s set in Computer Modern, the font LaTeX prints in, with headings in small capitals over thin rules.",
      "Each job and school takes two lines, what and where on the left and dates and place on the right, so it’s quick to scan. It suits a first job or an internship, with education near the top.",
    ],
    latex: true,
  },
  modernjack: {
    description:
      "Modern Jake’s resume template: the layout of Jake’s in a clean sans-serif font. Fill it in in your browser and download the PDF for free.",
    text: [
      "Modern Jake’s keeps the layout of Jake’s and sets it in Lato, a clean sans-serif, with plain bold headings instead of small capitals.",
      "It looks less like a LaTeX paper and reads well on a screen. It suits engineers a few years into their careers who still want everything on one tidy page.",
    ],
  },
  levelsfyi: {
    description:
      "Blueprint resume template: blue headings, a Helvetica-style font, and each job on one line, so it fits a lot on a page. Free, in your browser.",
    text: [
      "Blueprint is set in a Helvetica-style font with blue headings and rules. Your contact details sit in two columns under your name, and each job’s title, company and dates share one line.",
      "It fits a lot on a page, so it suits people with plenty to show: more than one degree, publications, or years of experience.",
    ],
  },
  referme: {
    description:
      "Compact resume template: small type, tight spacing and each job on a single line, to fit more on one page. Free, in your browser.",
    text: [
      "Compact puts each job’s company, place and role on one line, with the dates in italics on the right and headings in capitals. Small type and tight spacing leave room for more.",
      "It suits analysts, data scientists and anyone with several jobs and projects who’d rather not cut any to keep to one page.",
    ],
  },
  ian: {
    description:
      "Ian’s resume template: Lato with a blue name and headings, made to fit a lot of experience on one page. Free, in your browser.",
    text: [
      "Ian’s is set in Lato, with your name and the section headings in blue over thin blue rules, and dates in bold on the right.",
      "It fits a lot without looking crowded. It suits students applying for internships with several jobs, research and projects to show.",
    ],
  },
  resumeworded: {
    description:
      "Harvard resume template: the classic student format, set in Garamond. Fill it in in your browser and download the PDF for free.",
    text: [
      "Harvard follows the classic format many university career offices give students. It’s set in Garamond, with your name and the headings in capitals and school and company names in grey.",
      "It suits students and recent graduates applying for business, finance and consulting jobs, where a traditional page is expected. resumezip isn’t connected with Harvard.",
    ],
  },
  margin: {
    description:
      "Margin resume template: a book serif with section headings in the left margin, calm and easy to read. Free, in your browser.",
    text: [
      "Margin is set in Charis, a book serif, with the section headings in small capitals in the left margin and everything else in one wide column beside them.",
      "With the headings out of the way, a long story still reads calmly. It suits experienced people, like product managers, with a summary and several roles.",
    ],
  },
  swiss: {
    description:
      "Swiss resume template: a large bold name, Helvetica-style type and touches of red, after Swiss posters. Free, in your browser.",
    text: [
      "Swiss takes after Swiss posters: a large bold name, Helvetica-style type, a red rule under your contact details and red dashes before each line.",
      "It’s bold but plain. It suits designers and other creative roles who want a page with some character that hiring software still reads as text.",
    ],
  },
  mono: {
    description:
      "Mono resume template: set entirely in a monospaced font, with dashed rules, like a page of code. For engineers. Free, in your browser.",
    text: [
      "Mono is set entirely in IBM Plex Mono, a monospaced font, with short headings in capitals over dashed rules and the dates in grey, like a page of code.",
      "It suits engineers, especially in infrastructure and backend work, who want a resume that looks like where they spend their day.",
    ],
  },
  accent: {
    description:
      "Accent resume template: a clean sans-serif with green in the headings and bullets. Fill it in in your browser and download the PDF for free.",
    text: [
      "Accent is set in Source Sans, with the start of each heading, the places and the bullets in green, and a thin rule running from each heading to the edge.",
      "It’s clean with a touch of color. It suits data scientists, analysts and anyone who wants a page that stands out a little without getting loud.",
    ],
  },
  deedy: {
    description:
      "Deedy resume template, the two-column LaTeX resume. Fill it in in your browser, no LaTeX or Overleaf needed, and download the PDF for free.",
    text: [
      "Deedy is a two-column resume first made in LaTeX: education and skills in a narrow column on the left, experience and the rest on the right, under a large, light name.",
      "It suits students and new graduates in tech with a strong education section and a long list of skills.",
    ],
    latex: true,
  },
  zero2sudo: {
    description:
      "zero2sudo resume template: a plain Times page with your name in bold on the left and headings over thin rules. Free, in your browser.",
    text: [
      "zero2sudo is set in a Times-style serif, like a page from a word processor: your name large and bold on the left, headings in capitals over thin rules, and each job’s role and company in bold on one line with its dates.",
      "It’s plain and familiar, and fits a lot on a page. It suits software engineers and anyone with several jobs and projects to show.",
    ],
  },
}
