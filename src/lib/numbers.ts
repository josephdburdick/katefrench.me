export type NumberKind = "ratio" | "percent" | "multiple"

/** One entry of `numbers.attributes.items`. For a ratio, `value` is the 4 in "1 in 4". */
export type NumberItem = {
  id: string
  kind: NumberKind
  value: number
  label: string
}

export function formatNumber({
  kind,
  value,
}: Pick<NumberItem, "kind" | "value">) {
  if (kind === "ratio") return `1 in ${value}`
  if (kind === "percent") return `${value}%`
  return `${value}×`
}

/** How many of the block city's 100 blocks light up for `item`, 0 to 100. */
export function blocksFor({ kind, value }: Pick<NumberItem, "kind" | "value">) {
  if (!Number.isFinite(value)) return 0
  if (kind === "ratio") {
    if (value < 1) return 0
    return clamp(Math.round(100 / value))
  }
  return clamp(Math.round(value))
}

const clamp = (n: number) => Math.min(100, Math.max(0, n))

/**
 * The block city caption in two parts, so the page can put `lead` in bold:
 * "**10%** of cold messages get a reply." or
 * "**1 in 4** sales meetings ends with a new client."
 */
export function captionFor(item: NumberItem, phrase: string) {
  return { lead: formatNumber(item), rest: phrase }
}
