import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async redirects() {
    return [
      { source: "/certificates", destination: "/docs/certificates", permanent: true },
      { source: "/certificates/:path*", destination: "/docs/certificates/:path*", permanent: true },
    ];
  },
};

export default nextConfig;
