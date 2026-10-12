import AxeBuilder from "@axe-core/playwright"
import { expect, type Locator, type Page } from "@playwright/test"

// Safari logs these when a page is left while something is still loading in
// the background, and the visitor never sees them: the PDF compiler, its
// fonts and pdf.js's worker, which the home page, dashboard and editor start
// early, the scripts the compiler's worker loads as it starts, the PDF a
// preview or page picture is reading from its blob: URL, and the pages
// behind a page's links, which Next.js fetches ahead. They're only left out
// while the page is being left, so a load that fails on a page that stays
// open counts.
const CUT_SHORT = [
  /^Fetch API cannot load \S+\.(wasm|otf|ttf|mjs) due to access control checks\.$/,
  /^Cannot load (\S+\.m?js|blob:\S+) due to access control checks\.$/,
  /^Failed to fetch RSC payload for \S+\. Falling back to browser navigation\. TypeError: Load failed$/,
  // What pdf.js (4.8) throws after those: its worker cut short, it tries
  // to load the worker's code on the page instead, which is cut short too...
  /^Error: Setting up fake worker failed: "Importing a module script failed\."\.$/,
  // ...and a PDF's request cut short ends with no status and no headers,
  // which it reads into a Headers object, one with an empty name.
  /^Invalid header name: ''$/,
  /^UnexpectedResponseException: Unexpected server response \(0\) while retrieving PDF "blob:\S+"\.$/,
]
// Safari can report a load cut short just before the request for the next page.
const BEFORE_LEAVING_MS = 500

// Safari sometimes reports a load cut short as an error thrown by the page
// rather than logging it. Playwright splits a thrown error's text at its first
// colon, here the one in "http://", into a name ("Cannot load http") and a
// message ("/localhost:…"), dropping the character after the colon: "/", or
// "h" in "blob:http://". Put back together, it reads as it does when it's logged.
const thrownText = (error: Error) => {
  if (/ https?$/.test(error.name)) return `${error.name}:/${error.message}`
  if (/ blob$/.test(error.name)) return `${error.name}:h${error.message}`
  return error.message
}

/**
 * Collects the errors a page throws or logs, for a test to check at the end.
 * Logged errors end with where they came from, e.g. "… (at http://…/page)".
 */
export function pageErrors(page: Page): string[] {
  const errors: string[] = []
  // A page is being left from the request for the next one until that one's
  // DOMContentLoaded. The first page loaded leaves nothing.
  let loaded = page.url() !== "about:blank"
  let leaving = false
  // Loads cut short while the page wasn't being left, in case it's left just after.
  let recent: { entry: string; at: number }[] = []
  page.on("request", (request) => {
    if (!loaded || !request.isNavigationRequest() || request.frame() !== page.mainFrame()) return
    leaving = true
    const now = Date.now()
    for (const { entry, at } of recent) {
      const index = errors.indexOf(entry)
      if (now - at <= BEFORE_LEAVING_MS && index !== -1) errors.splice(index, 1)
    }
    recent = []
  })
  page.on("domcontentloaded", () => {
    loaded = true
    leaving = false
  })
  // `text` is the error as Safari words it, to tell a load cut short.
  const add = (entry: string, text: string) => {
    if (CUT_SHORT.some((pattern) => pattern.test(text))) {
      if (leaving) return
      recent.push({ entry, at: Date.now() })
    }
    errors.push(entry)
  }
  page.on("pageerror", (error) => add(error.message, thrownText(error)))
  page.on("console", (message) => {
    if (message.type() === "error") add(`${message.text()} (at ${message.location().url})`, message.text())
  })
  return errors
}

/** Waits for the CSS transitions under way to end, as a dialog fading in. */
export async function transitionsDone(page: Page): Promise<void> {
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        // Transitions only: CSS animations, as a spinner's, can go on for ever.
        .filter((animation) => "transitionProperty" in animation)
        .map((animation) => animation.finished.catch(() => undefined)),
    ),
  )
}

/**
 * Waits until no transition is under way on an element, on what contains it
 * or on what's in it, as a dialog growing into place, so a box read next is
 * its final one. Each look comes two frames on: a transition can start with
 * the next frame, and its transitionrun event comes with the one after.
 * A view transition counts too: until it ends, what shows of the element is
 * its picture, moving from where it was. Its animations are on the root's
 * ::view-transition pseudo-elements, and start as the browser pictures the
 * new view, at the next frame after it's rendered. Only those still playing
 * count: once done, they hold their last frame (fill: both), and WebKit went
 * on listing one after Start writing's rise had played, which held up every
 * test that came into the editor that way. A failure names what's moving.
 */
export async function settled(locator: Locator): Promise<void> {
  await expect
    .poll(
      () =>
        locator.evaluate(async (element) => {
          await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))
          return document.getAnimations().flatMap((animation) => {
            const effect = animation.effect as KeyframeEffect | null
            const target = effect?.target
            if (!target || !(target.contains(element) || element.contains(target))) return []
            if ("transitionProperty" in animation)
              return [`${target.tagName.toLowerCase()} ${(animation as CSSTransition).transitionProperty}`]
            if (!effect.pseudoElement?.startsWith("::view-transition") || animation.playState !== "running") return []
            return [`${effect.pseudoElement} ${(animation as CSSAnimation).animationName}${animation.pending ? " pending" : ""}`]
          })
        }),
      { message: "nothing on, in or around it is transitioning" },
    )
    .toEqual([])
}

/**
 * Whether the ink in a row of chips, the pill on the picked one, covers that
 * chip to within a pixel, and is the only ink there. The pill is cut down to
 * the chip by its clip-path, an inset().
 */
export async function inkCovers(row: Locator, chip: Locator): Promise<boolean> {
  const box = (await chip.boundingBox())!
  const ink = await row.evaluate((row) =>
    [...row.querySelectorAll("*")].flatMap((element) => {
      const style = getComputedStyle(element)
      if (style.backgroundColor !== "rgb(17, 19, 24)" || style.visibility !== "visible") return []
      // inset(top right bottom left), which may be written shorter, as margins are.
      const sides = /^inset\(([^)]*?)(?: round [^)]*)?\)$/.exec(style.clipPath)?.[1].split(" ").map(parseFloat) ?? [0]
      const [top, right = top, bottom = top, left = right] = sides
      const { x, y, width, height } = element.getBoundingClientRect()
      return [{ x: x + left, y: y + top, width: width - left - right, height: height - top - bottom }]
    }),
  )
  return ink.length === 1 && (["x", "y", "width", "height"] as const).every((side) => Math.abs(ink[0][side] - box[side]) < 1)
}

/** Counts the slides of the pill in a row of chips from now on: the clip-path transitions that start in it. */
export async function countSlides(row: Locator): Promise<() => Promise<number>> {
  const count = await row.evaluateHandle((row) => {
    const count = { slides: 0 }
    row.addEventListener("transitionrun", (event) => {
      if ((event as TransitionEvent).propertyName === "clip-path") count.slides++
    })
    return count
  })
  return () => count.evaluate((count) => count.slides)
}

/**
 * The page's serious and critical problems under WCAG 2.1 A and AA, as
 * readable lines, leaving out the parts matching `exclude`.
 */
export async function seriousAccessibilityProblems(page: Page, exclude: string[] = []): Promise<string[]> {
  // Something fading in would be read part-way, with colors too faint for its contrast.
  await transitionsDone(page)
  let axe = new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
  for (const selector of exclude) axe = axe.exclude(selector)
  const { violations } = await axe.analyze()
  return violations
    .filter((violation) => violation.impact === "serious" || violation.impact === "critical")
    .map((violation) => `${violation.id}: ${violation.help} (${violation.nodes.map((node) => node.target.join(" ")).join(", ")})`)
}

/**
 * Lets a test hold the resumes sent to the PDF compiler's worker (holdPreviews),
 * so the preview, and the checks on it, wait. It also counts the PDFs the
 * worker sends back (previewsBuilt), whether or not the page still wants them.
 */
export async function holdablePreviews(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const held: (() => void)[] = []
    let holding = false
    ;(window as any).previewsBuilt = 0
    ;(window as any).holdPreviews = (hold: boolean) => {
      holding = hold
      if (!hold) for (const send of held.splice(0)) send()
    }
    const RealWorker = window.Worker
    window.Worker = class extends RealWorker {
      constructor(...args: ConstructorParameters<typeof Worker>) {
        super(...args)
        this.addEventListener("message", (event) => {
          if (event.data?.pdf !== undefined) (window as any).previewsBuilt++
        })
      }
      postMessage(message: any, options?: any) {
        // A resume to compile has an id and a template; the grammar checker's texts have no template.
        if (holding && message?.id !== undefined && message?.template !== undefined) held.push(() => super.postMessage(message, options))
        else super.postMessage(message, options)
      }
    }
  })
}

/** Holds resumes on their way to the compiler, or sends the held ones on. */
export const holdPreviews = (page: Page, hold: boolean): Promise<void> => page.evaluate((hold) => (window as any).holdPreviews(hold), hold)

/** How many PDFs the compiler's worker has sent back, with holdablePreviews. */
export const previewsBuilt = (page: Page): Promise<number> => page.evaluate(() => (window as any).previewsBuilt)

/** Chooses a template from the gallery behind the header's Template button, which every screen has. */
export async function chooseTemplate(page: Page, name: string): Promise<void> {
  await page.getByRole("button", { name: /^Template/ }).click()
  await page.getByRole("dialog", { name: "Choose a template" }).getByRole("button", { name, exact: true }).click()
}

/** What names the resume's template on screen: the header's Template button. */
export const templateShown = (page: Page): Locator => page.getByRole("button", { name: /^Template/ })

/**
 * The editor's heading of a section, such as "Experience". Not the preview's:
 * the PDF tags its section titles as headings, which pdf.js shows as headings
 * in the page, and WebKit names them, so one of the same name is in both.
 */
export const editorHeading = (page: Page, name: string, options: { exact?: boolean } = {}): Locator =>
  page.getByRole("main").getByRole("heading", { name, ...options })

/**
 * What names the resume's template on screen, once the editor is open. On
 * wide screens it's in the left panel's Style tab, so that's opened first;
 * narrower, the header's Template button says it.
 */
export async function templateChosen(page: Page): Promise<Locator> {
  const style = page.getByRole("tab", { name: "Style" })
  await expect(style).toBeVisible()
  if (await templateShown(page).isHidden()) await style.click()
  return templateShown(page)
}

// A box that shows bold and italic words is an editable div that draws a div
// per line, with bold words in <strong> and italic ones in <em>
// (src/components/editor/boxDom.ts). Its text counts a character for each line
// break, as a text box's would.

/** The text in a box, a line per line, as it shows it: without its bold and italic marks. */
export const boxText = (box: Locator) => box.evaluate((element) => [...element.children].map((line) => line.textContent ?? "").join("\n"))

/** Selects from `start` to `end` in a box's text, or puts the cursor at `start`. */
export const selectInBox = (box: Locator, start: number, end = start) =>
  box.evaluate(
    (element, [start, end]) => {
      const pointAt = (offset: number): [Node, number] => {
        const lines = [...element.children]
        for (const [index, line] of lines.entries()) {
          const length = line.textContent?.length ?? 0
          if (offset <= length || index === lines.length - 1) {
            const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT)
            for (let node = walker.nextNode(); node; node = walker.nextNode()) {
              if (offset <= (node as Text).length) return [node, offset]
              offset -= (node as Text).length
            }
            return [line, 0]
          }
          offset -= length + 1
        }
        return [element, 0]
      }
      const [from, to] = [pointAt(start), pointAt(end)]
      getSelection()!.setBaseAndExtent(from[0], from[1], to[0], to[1])
    },
    [start, end],
  )

/** Where the cursor is in a box's text. */
export const cursorInBox = (box: Locator) =>
  box.evaluate((element) => {
    const { focusNode, focusOffset } = getSelection()!
    let offset = 0
    for (const line of element.children) {
      if (focusNode && line.contains(focusNode)) {
        const range = document.createRange()
        range.setStart(line, 0)
        range.setEnd(focusNode, focusOffset)
        return offset + range.toString().length
      }
      offset += (line.textContent?.length ?? 0) + 1
    }
    return -1
  })
