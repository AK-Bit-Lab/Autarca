/** @type {import('next').NextConfig} */
const nextConfig = {
    webpack: (config, { isServer }) => {
        if (isServer) {
            config.externals.push('isomorphic-fetch', 'node-fetch');
        }
        return config;
    }
};
export default nextConfig;
