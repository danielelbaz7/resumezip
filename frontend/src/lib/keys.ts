// Keyboard checks shared by the site's own shortcuts.

/** Whether shortcuts here use ⌘ rather than Ctrl. */
export const onMac = () => /Mac|iPhone|iPad/.test(navigator.platform)

/** A keyboard shortcut as this device writes it: ⌘B on a Mac, Ctrl+B elsewhere. */
export const shortcut = (key: string) => (onMac() ? `⌘${key}` : `Ctrl+${key}`)

/** Whether a key pressed in this element is typing, which a page's own shortcut mustn't take over. */
export const typingIn = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
