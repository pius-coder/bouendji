/** @type {import('next').NextConfig} */
const nextConfig = {
  // Export statique : le dashboard est servi par l'API sous /admin/, sans
  // second service, sans CDN et sans routeur serveur (D31).
  output: "export",
  basePath: "/admin",
  trailingSlash: true,
  images: { unoptimized: true },
  reactStrictMode: true,
  poweredByHeader: false,
};

export default nextConfig;
