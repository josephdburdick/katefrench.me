import fm from "front-matter"

export interface ContentRow {
  key: string
  attributes: string
  body: string
  /** 1 when the file's front matter has `draft: true`, else 0. */
  draft: 0 | 1
}

const basePath = /\$\{basePath\}/g

/** Turns `content/<key>.md` sources, keyed by file name without `.md`, into `content` rows. */
export function contentRows(files: Record<string, string>): ContentRow[] {
  return Object.entries(files).map(([key, source]) => {
    const { attributes, body } = fm<Record<string, unknown>>(source)
    const { draft, ...rest } = attributes
    // JSON.stringify turns YAML dates into the ISO strings the old build served.
    return {
      key,
      attributes: JSON.stringify(rest).replace(basePath, ""),
      body: body.replace(basePath, ""),
      draft: draft === true ? 1 : 0,
    }
  })
}
