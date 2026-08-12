import Link from 'next/link'

export function PageHeader({
  title,
  subtitle,
  backHref,
  backLabel,
  action,
}: {
  title: string
  subtitle?: React.ReactNode
  backHref?: string
  backLabel?: string
  action?: React.ReactNode
}) {
  return (
    <div className="mb-6">
      {backHref && (
        <Link
          href={backHref}
          className="text-muted-foreground hover:text-foreground mb-2 inline-block text-sm"
        >
          ← {backLabel ?? 'Back'}
        </Link>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
          {subtitle && <div className="text-muted-foreground mt-1 text-sm">{subtitle}</div>}
        </div>
        {action}
      </div>
    </div>
  )
}

export function EmptyState({
  title,
  children,
}: {
  title: string
  children?: React.ReactNode
}) {
  return (
    <div className="border-muted-foreground/25 rounded-xl border border-dashed px-6 py-10 text-center">
      <p className="font-medium">{title}</p>
      {children && <div className="text-muted-foreground mt-1 text-sm">{children}</div>}
    </div>
  )
}
