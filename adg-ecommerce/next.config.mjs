/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Enable standalone output for Cloud Run
  output: 'standalone',
  // Configure external packages for server components
  serverExternalPackages: ['@google-cloud/bigquery', '@google-cloud/firestore'],
  // Ensure static files are properly handled
  trailingSlash: false,
  // Optimize for production
  compress: true,
  // Handle public directory properly
  assetPrefix: process.env.NODE_ENV === 'production' ? '' : ''
};

export default nextConfig;

