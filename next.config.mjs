/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: ".next-build-out",
  experimental: {
    typedRoutes: true
  }
};

export default nextConfig;

