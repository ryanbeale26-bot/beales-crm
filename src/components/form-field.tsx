import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

/**
 * Label + control + optional hint. Only `name` and `label` are required —
 * nothing in this app should demand more of a form than it has to.
 */
export function Field({
  label,
  htmlFor,
  hint,
  required,
  className,
  children,
}: {
  label: string
  htmlFor?: string
  hint?: string
  required?: boolean
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={cn('space-y-1', className)}>
      <Label htmlFor={htmlFor} className="text-muted-foreground text-[13px] font-normal">
        {label}
        {required && <span className="text-destructive"> *</span>}
      </Label>
      {children}
      {hint && <p className="text-muted-foreground/80 text-xs">{hint}</p>}
    </div>
  )
}

/**
 * A plain <select>. Deliberately not the fancy dropdown: on a phone this opens
 * the native iOS picker, which is far quicker in a car park than a custom menu.
 */
export function Select({
  className,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        'bg-muted flex h-8 w-full rounded-[3px] border-0 px-2 text-base outline-none',
        'focus-visible:ring-2 focus-visible:ring-ring',
        'disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
        className,
      )}
      {...props}
    />
  )
}

export function FormError({ message }: { message?: string }) {
  if (!message) return null
  return (
    <p role="alert" className="bg-destructive/10 text-destructive rounded-md px-3 py-2 text-sm">
      {message}
    </p>
  )
}
