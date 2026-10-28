import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    // Aligné sur ADMIN_STALE_TIME_MS (30 s) : un aller-retour entre deux pages sert le
    // cache client instantanément sans skeleton ; une mutation l'invalide via refresh() + invalidateAdmin().
    staleTimes: {
      dynamic: 30,
      static: 180,
    },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
