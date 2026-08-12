import type { Metadata, Viewport } from 'next'

import './globals.css'

export const metadata: Metadata = {
  title: "Beale's CRM",
  description: 'Internal CRM for Beale’s LLC',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-full antialiased">{children}</body>
    </html>
  )
}
