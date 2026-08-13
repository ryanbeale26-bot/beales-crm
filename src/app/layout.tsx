import type { Metadata, Viewport } from 'next'
import { Montserrat } from 'next/font/google'

import './globals.css'

export const metadata: Metadata = {
  title: "Beale's CRM",
  description: 'Internal CRM for Beale’s LLC',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#1b3a6b',
}

/**
 * Headings only. The brand guide names Arial Black / Montserrat for headlines
 * and Arial / Open Sans for body, so body text uses the stack below — Arial is
 * on every Mac, iPhone and PC already, which means body copy paints on the
 * first frame with nothing to download.
 */
const montserrat = Montserrat({
  subsets: ['latin'],
  weight: ['600', '700'],
  display: 'swap',
  variable: '--font-montserrat',
})

const bodyStack = [
  'Arial',
  'ui-sans-serif',
  '-apple-system',
  'BlinkMacSystemFont',
  '"Segoe UI"',
  'Helvetica',
  '"Apple Color Emoji"',
  'sans-serif',
].join(', ')

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={montserrat.variable}
      style={{ ['--font-sans' as string]: bodyStack }}
    >
      <body className="min-h-full antialiased">{children}</body>
    </html>
  )
}
