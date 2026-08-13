import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Spreadsheets are uploaded to a server action; the default cap is 1MB.
      bodySizeLimit: '10mb',
    },
  },
}

export default nextConfig
