import * as React from "react"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        // Filled, borderless fields — the grey block is the affordance, not an
        // outline. Ring only on keyboard focus.
        "h-8 w-full min-w-0 rounded-[3px] border-0 bg-muted px-2 py-1 text-base outline-none transition-[background,box-shadow] duration-[20ms] placeholder:text-muted-foreground/70 focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        className
      )}
      {...props}
    />
  )
}

export { Input }
