import Link from 'next/link'

/**
 * A page opens like a document: breadcrumb, then a large title, then a quiet
 * line of properties. Actions sit to the right and stay understated — the
 * content is the point, not the chrome.
 */
export function PageHeader({
  title,
  subtitle,
  breadcrumbs,
  backHref,
  backLabel,
  action,
}: {
  title: string
  subtitle?: React.ReactNode
  breadcrumbs?: { label: string; href?: string }[]
  backHref?: string
  backLabel?: string
  action?: React.ReactNode
}) {
  const crumbs = breadcrumbs ?? (backHref ? [{ label: backLabel ?? 'Back', href: backHref }] : [])

  return (
    <div className="mb-6">
      {crumbs.length > 0 && (
        <nav className="text-muted-foreground mb-4 flex items-center gap-1 text-sm">
          {crumbs.map((c, i) => (
            <span key={i} className="flex items-center gap-1">
              {i > 0 && <span className="opacity-40">/</span>}
              {c.href ? (
                <Link href={c.href} className="row-hover rounded-[3px] px-1 py-0.5 hover:text-foreground">
                  {c.label}
                </Link>
              ) : (
                <span className="px-1">{c.label}</span>
              )}
            </span>
          ))}
        </nav>
      )}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <h1 className="page-title min-w-0">{title}</h1>
        {action && <div className="flex shrink-0 gap-2 pt-2">{action}</div>}
      </div>

      {subtitle && <div className="text-muted-foreground mt-2 text-sm">{subtitle}</div>}
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
    <div className="text-muted-foreground py-12 text-center text-sm">
      <p className="text-foreground/70">{title}</p>
      {children && <div className="mt-1">{children}</div>}
    </div>
  )
}

/** A list of records. Hairline dividers, no surrounding box. */
export function RowList({ children }: { children: React.ReactNode }) {
  return <div className="border-border border-t">{children}</div>
}

export function Row({
  href,
  title,
  meta,
  right,
  badges,
}: {
  href: string
  title: React.ReactNode
  meta?: React.ReactNode
  right?: React.ReactNode
  badges?: React.ReactNode
}) {
  return (
    <Link
      href={href}
      className="row-hover border-border flex items-center justify-between gap-4 border-b px-2 py-2.5"
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate font-medium">{title}</span>
          {badges}
        </div>
        {meta && <p className="text-muted-foreground mt-0.5 truncate text-sm">{meta}</p>}
      </div>
      {right && <div className="shrink-0 text-right text-sm">{right}</div>}
    </Link>
  )
}

/** Key/value line used on detail pages, in the style of page properties. */
export function Property({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2 py-1 text-sm">
      <dt className="text-muted-foreground w-36 shrink-0 truncate">{label}</dt>
      <dd className="min-w-0 flex-1">{children}</dd>
    </div>
  )
}

/** A section heading inside a page. */
export function SectionTitle({
  children,
  aside,
}: {
  children: React.ReactNode
  aside?: React.ReactNode
}) {
  return (
    <div className="mt-8 mb-2 flex items-baseline justify-between gap-2">
      <h2 className="text-base font-semibold">{children}</h2>
      {aside}
    </div>
  )
}
