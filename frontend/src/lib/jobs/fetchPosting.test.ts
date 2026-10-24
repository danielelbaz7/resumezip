import { describe, expect, test } from "vitest"
import { blockedAddress, fetchableUrl } from "./fetchPosting"

describe("a link the server fetches", () => {
  test("is a public web address on its usual port", () => {
    expect(fetchableUrl("https://boards.greenhouse.io/acme/jobs/123")?.hostname).toBe("boards.greenhouse.io")
    expect(fetchableUrl("http://jobs.acme.com/1")).not.toBeNull()
  })

  test("isn't anything else: another scheme, a port, a password, this machine or a private network", () => {
    for (const link of [
      "file:///etc/passwd",
      "ftp://jobs.acme.com/1",
      "https://jobs.acme.com:8443/1",
      "https://user:secret@jobs.acme.com/1",
      "http://localhost/admin",
      "http://printer.local/",
      "http://metadata.google.internal/computeMetadata/v1/",
      "http://127.0.0.1/",
      "http://10.0.0.5/",
      "http://169.254.169.254/latest/meta-data/",
      "http://[::1]/",
      "http://[fd00::1]/",
      "not a link",
    ]) {
      expect(fetchableUrl(link), link).toBeNull()
    }
  })
})

describe("an address the server connects to", () => {
  test("is turned away when it isn't on the public internet", () => {
    for (const address of [
      "127.0.0.1",
      "10.1.2.3",
      "172.20.0.1",
      "192.168.1.1",
      "100.64.0.1",
      "169.254.169.254",
      "0.0.0.0",
      "::1",
      "fe80::1",
      "fc00::1",
      "::ffff:127.0.0.1",
      "nope",
    ]) {
      expect(blockedAddress(address), address).toBe(true)
    }
  })

  test("is let through when it is", () => {
    for (const address of ["93.184.216.34", "140.82.112.3", "2606:4700::6810:84e5"]) expect(blockedAddress(address), address).toBe(false)
  })
})
