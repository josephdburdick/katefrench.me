import { Button } from "@/components/ui/button"
import { ArrowDown, ArrowUp, Ellipsis, Plus, Trash2 } from "lucide-react"
import { DropdownMenu } from "radix-ui"
import { type ReactNode, useState } from "react"

export function moved<T>(list: T[], index: number, by: -1 | 1) {
  const next = [...list]
  const [item] = next.splice(index, 1)
  next.splice(index + by, 0, item)
  return next
}

const iconButtonClass =
  "border-primary/30 bg-background text-foreground hover:border-primary hover:bg-primary/15 active:bg-primary/25 data-[state=open]:bg-primary/15 inline-flex size-11 shrink-0 items-center justify-center rounded-md border focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground disabled:opacity-35"

/** A menu to move or delete one section or entry. Delete asks once, in place. */
export function ItemMenu({
  name,
  first,
  last,
  onMove,
  onDelete,
  canDelete = true,
}: {
  name: string
  first: boolean
  last: boolean
  onMove: (by: -1 | 1) => void
  onDelete: () => void
  canDelete?: boolean
}) {
  const [confirming, setConfirming] = useState(false)
  if (confirming) {
    return (
      <div role="group" className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold">Delete {name}?</span>
        <Button
          type="button"
          variant="outline"
          className="min-h-11"
          onClick={() => {
            setConfirming(false)
            onDelete()
          }}
        >
          Delete
        </Button>
        <Button
          type="button"
          variant="outline"
          className="min-h-11"
          onClick={() => setConfirming(false)}
        >
          Keep
        </Button>
      </div>
    )
  }
  const itemClass =
    "data-[highlighted]:bg-secondary flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-3 text-base outline-none select-none data-[disabled]:cursor-default data-[disabled]:opacity-40"
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        className={iconButtonClass}
        aria-label={`Move or delete ${name}`}
      >
        <Ellipsis aria-hidden="true" className="size-5" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className="border-primary/30 bg-background text-foreground z-20 min-w-44 rounded-lg border p-1 shadow-lg"
        >
          <DropdownMenu.Item
            className={itemClass}
            disabled={first}
            onSelect={() => onMove(-1)}
          >
            <ArrowUp aria-hidden="true" className="size-4" />
            Move up
          </DropdownMenu.Item>
          <DropdownMenu.Item
            className={itemClass}
            disabled={last}
            onSelect={() => onMove(1)}
          >
            <ArrowDown aria-hidden="true" className="size-4" />
            Move down
          </DropdownMenu.Item>
          <DropdownMenu.Separator className="bg-primary/20 my-1 h-px" />
          <DropdownMenu.Item
            className={itemClass}
            disabled={!canDelete}
            onSelect={() => setConfirming(true)}
          >
            <Trash2 aria-hidden="true" className="size-4" />
            Delete
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

export function AddButton({
  children,
  onClick,
}: {
  children: ReactNode
  onClick: () => void
}) {
  return (
    <Button
      type="button"
      variant="outline"
      className="min-h-11 self-start"
      onClick={onClick}
    >
      <Plus aria-hidden="true" className="size-4" />
      {children}
    </Button>
  )
}
