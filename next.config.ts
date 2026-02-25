import type { NextConfig } from 'next'
import path from 'path'

const nextConfig: NextConfig = {
  // Explicitly set the tracing root to avoid lockfile detection warnings
  outputFileTracingRoot: path.join(__dirname),
}

export default nextConfig
