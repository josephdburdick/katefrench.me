import xssDefault from "xss"

// xss is CommonJS with its named exports on the default export; named imports
// fail in the Workers test runtime, so read them from the default.
const { FilterXSS, safeAttrValue } =
  xssDefault as unknown as typeof import("xss")

const headings = ["h1", "h2", "h3", "h4", "h5", "h6"]

const filter = new FilterXSS({
  whiteList: {
    p: [],
    a: ["href", "target", "title", "rel"],
    strong: [],
    em: [],
    ul: [],
    ol: [],
    li: [],
    br: [],
    span: [],
    ...Object.fromEntries(headings.map((tag) => [tag, []])),
    code: [],
    pre: [],
    blockquote: [],
  },
  stripIgnoreTag: true,
  stripIgnoreTagBody: ["script", "style", "iframe"],
  allowCommentTag: false,
  safeAttrValue(tag, name, value, cssFilter) {
    const safe = safeAttrValue(tag, name, value, cssFilter)
    // js-xss lets `data:image/` through in href and src; stored content never needs a data: URL.
    if (/^data:/i.test(safe.trim())) return ""
    return safe
  },
})

/** Strips everything outside the content allow list. Runs without a DOM, in the Worker and the browser. */
export function sanitizeHtml(html: string): string {
  return filter.process(html)
}
