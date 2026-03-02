import type { NextConfig } from 'next'
import path from 'path'
import { version } from './package.json'

const nextConfig: NextConfig = {
  // Explicitly set the tracing root to avoid lockfile detection warnings
  outputFileTracingRoot: path.join(__dirname),
  env: {
    NEXT_PUBLIC_APP_VERSION: version,
  },
}

export default nextConfig
