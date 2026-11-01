import type { NextConfig } from "next";

// ShipCheck should pass its own live-site checks.
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      // Next.js inlines small bootstrap scripts; 'unsafe-eval' only in dev for React Refresh.
      `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "production" ? "" : " 'unsafe-eval'"} https://js.stripe.com`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https://avatars.githubusercontent.com",
      "font-src 'self'",
      "connect-src 'self'",
      "frame-src https://js.stripe.com https://checkout.stripe.com",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self' https://checkout.stripe.com https://github.com",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  productionBrowserSourceMaps: false,
  poweredByHeader: false,
  serverExternalPackages: ["postgres"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // The badge is meant to be embedded on other sites (GitHub READMEs).
      { source: "/api/badge/:path*", headers: [{ key: "Cross-Origin-Resource-Policy", value: "cross-origin" }] },
    ];
  },
};

export default nextConfig;
