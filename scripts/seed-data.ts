import fm from "front-matter"

export interface ContentRow {
  key: string
  attributes: string
  body: string
}

const basePath = /\$\{basePath\}/g

/** Turns `content/<key>.md` sources, keyed by file name without `.md`, into `content` rows. */
export function contentRows(files: Record<string, string>): ContentRow[] {
  return Object.entries(files).map(([key, source]) => {
    const { attributes, body } = fm(source)
    // JSON.stringify turns YAML dates into the ISO strings the old build served.
    return {
      key,
      attributes: JSON.stringify(attributes).replace(basePath, ""),
      body: body.replace(basePath, ""),
    }
  })
}
