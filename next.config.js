/** @type {import('next').NextConfig} */
module.exports = async () => {
  const { default: nextra } = await import('nextra')
  const { default: withPWAInit } = await import('next-pwa')

  const withNextra = nextra({
    // Add Nextra-specific options here if needed
  })

  const baseConfig = {
    // Configure pageExtensions to include md and mdx
    pageExtensions: ['ts', 'tsx', 'js', 'jsx', 'md', 'mdx'],
    async rewrites() {
      const assistantBaseUrl = process.env.ASSISTANT_BASE_URL || process.env.ASSISTANT_DEV_URL || ''
      const assistantUrl = assistantBaseUrl ? assistantBaseUrl.replace(/\/$/, '') : ''

      const assistantRewrites = assistantUrl
        ? [
            {
              source: '/assistant',
              destination: `${assistantUrl}/assistant`,
            },
            {
              source: '/assistant/:path*',
              destination: `${assistantUrl}/assistant/:path*`,
            },
          ]
        : []

      return {
        beforeFiles: assistantRewrites,
        afterFiles: [],
      }
    },
    images: {
      // Disable Next.js image optimization so Cloudflare/OpenNext serves
      // images directly from the public folder without using /_next/image.
      unoptimized: true,
      remotePatterns: [
        {
          protocol: 'https',
          hostname: 'drive.google.com',
          pathname: '/**',
        },
      ],
    },
    experimental: {
      turbo: {
        resolveAlias: {
          'next-mdx-import-source-file': './mdx-components.tsx',
        },
      },
    },
  }

  const withPWA = withPWAInit({
    dest: 'public',
    // Disable PWA/service worker in development to avoid noisy GenerateSW warnings
    disable: process.env.NODE_ENV === 'development',
    register: true,
  })

  return withNextra(withPWA(baseConfig))
}