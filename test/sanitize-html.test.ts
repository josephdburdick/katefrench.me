import { describe, expect, it } from "vitest"

import { sanitizeHtml } from "../src/lib/sanitize-html"

const guidesByVibes =
  '<p><a href="https://www.instagram.com/guidesbyvibes" target="_blank">Guides By Vibes</a></p>'

describe("sanitizeHtml", () => {
  it("keeps today's content links", () => {
    expect(sanitizeHtml(guidesByVibes)).toContain(
      '<a href="https://www.instagram.com/guidesbyvibes" target="_blank">Guides By Vibes</a>',
    )
  })

  it("drops data: URLs", () => {
    const out = sanitizeHtml(
      '<a href="data:text/html,<script>alert(1)</script>">x</a><a href="data:image/png;base64,AAAA">y</a>',
    )
    expect(out).not.toContain("data:")
  })

  it("drops style blocks with their contents", () => {
    const out = sanitizeHtml("<style>body{display:none}</style><p>ok</p>")
    expect(out).not.toContain("<style")
    expect(out).not.toContain("display:none")
    expect(out).toBe("<p>ok</p>")
  })

  it("drops scripts, iframes, event handlers and comments", () => {
    const out = sanitizeHtml(
      '<script>alert(1)</script><iframe src="https://x">in</iframe><p onclick="alert(1)">ok</p><!-- c --><a href="javascript:alert(1)">x</a>',
    )
    for (const bad of [
      "<script",
      "alert(1)",
      "<iframe",
      "onclick",
      "<!--",
      "javascript:",
    ]) {
      expect(out).not.toContain(bad)
    }
    expect(out).toContain("<p>ok</p>")
  })
})
