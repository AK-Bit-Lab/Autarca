/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['casper-js-sdk', 'isomorphic-fetch', 'node-fetch'],
  },
};
export default nextConfig;
