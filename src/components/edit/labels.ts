import type { Path } from "@/lib/edit-content"

const WORDS: Record<string, string> = {
  alt: "Photo description",
  signoff: "Sign-off",
  when: "Dates",
}

const capitalize = (text: string) =>
  text.charAt(0).toUpperCase() + text.slice(1)

const words = (segment: string) =>
  WORDS[segment] ??
  capitalize(segment.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase())

const singular = (word: string) =>
  word.endsWith("s") && !word.endsWith("ss") ? word.slice(0, -1) : word

/** `["city", "buttons", 0, "text"]` reads as `["City", "Button 1", "Text"]`. */
export function labelParts(path: Path): string[] {
  const parts: string[] = []
  path.forEach((segment, i) => {
    if (typeof segment === "string") {
      parts.push(words(segment))
    } else if (typeof path[i - 1] === "string") {
      parts[parts.length - 1] =
        `${singular(parts[parts.length - 1])} ${segment + 1}`
    } else {
      parts.push(`Part ${segment + 1}`)
    }
  })
  return parts
}
