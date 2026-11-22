/** Local-only scripts take no arguments and never touch remote data. Throws on any argument, `--remote` first of all, naming `command`. */
export function assertLocalOnly(command: string, args: string[]) {
  const remote = args.find(
    (arg) => arg === "--remote" || arg.startsWith("--remote="),
  )
  if (remote)
    throw new Error(
      `${command} is local only and will not touch the remote database (got ${remote}).`,
    )
  if (args.length)
    throw new Error(
      `${command} is local only and takes no arguments; it will not touch the remote database (got ${args.join(" ")}).`,
    )
}
