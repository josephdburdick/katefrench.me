/** The seed takes no arguments and only ever touches local data. Throws on any argument, `--remote` first of all. */
export function assertLocalOnly(args: string[]) {
  const remote = args.find(
    (arg) => arg === "--remote" || arg.startsWith("--remote="),
  )
  if (remote)
    throw new Error(
      `seed:local is local only and will not touch the remote database (got ${remote}).`,
    )
  if (args.length)
    throw new Error(
      `seed:local is local only and takes no arguments; it will not touch the remote database (got ${args.join(" ")}).`,
    )
}
