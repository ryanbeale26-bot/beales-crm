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
  themeColor: '#ffffff',
}

/**
 * The system font stack, which resolves to SF Pro on Mac and iPhone. No webfont
 * download, so text paints on the first frame — which matters more than brand
 * typography when someone is opening this on 4G in a car park.
 */
const fontStack = [
  'ui-sans-serif',
  '-apple-system',
  'BlinkMacSystemFont',
  '"Segoe UI"',
  'Helvetica',
  '"Apple Color Emoji"',
  'Arial',
  'sans-serif',
].join(', ')

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" style={{ ['--font-sans' as string]: fontStack }}>
      <body className="min-h-full antialiased">{children}</body>
    </html>
  )
}
