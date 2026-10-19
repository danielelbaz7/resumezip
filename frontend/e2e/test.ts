import { test as base, type Browser, type BrowserContext } from "@playwright/test"

export * from "@playwright/test"

// Specs import test and expect from here, not from @playwright/test (lint
// enforces it), so that WebKit's tests draw the glass without its blur.
//
// CI's WebKit draws without a GPU, and backdrop-filter is costly to draw there:
// every click and focus check waits on frames, and the glass laid over the
// sky on the dashboard, the templates and the editor made each test about 25%
// slower (35% on the dashboard), timed in CI in October 2026. No test checks
// the blur, and Chromium's tests keep it.
const NO_BLUR = "*, *::before, *::after { -webkit-backdrop-filter: none !important; backdrop-filter: none !important }"

// An adopted stylesheet rather than a <style> element: an element the server
// didn't render is a hydration mismatch, which pageErrors would count.
const adopt = (css: string) => {
  const sheet = new CSSStyleSheet()
  sheet.replaceSync(css)
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet]
}

const patched = new WeakSet<Browser>()

export const test = base.extend<{ noRealAi: void }, { noBlurInWebKit: void }>({
  // The review page asks the AI as soon as a resume is read. A test that
  // doesn't answer /api/review itself (page.route goes first) gets "off", as on
  // a site with no AI keys: no test asks a real AI, even where .env.local has keys.
  noRealAi: [
    async ({ context }, use) => {
      await context.route("**/api/review", (route) => route.fulfill({ status: 503, json: { error: "off" } }))
      await use()
    },
    { auto: true },
  ],
  // On the browser, so the contexts a test opens itself (browser.newContext()) get it too, as well as its own.
  noBlurInWebKit: [
    async ({ browser, browserName }, use) => {
      if (browserName === "webkit" && !patched.has(browser)) {
        patched.add(browser)
        const newContext = browser.newContext.bind(browser)
        browser.newContext = async (...args: Parameters<Browser["newContext"]>): Promise<BrowserContext> => {
          const context = await newContext(...args)
          await context.addInitScript(adopt, NO_BLUR)
          return context
        }
      }
      await use()
    },
    { scope: "worker", auto: true },
  ],
})
