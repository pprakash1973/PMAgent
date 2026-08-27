import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Azure App Service needs a self-contained bundle; Vercel manages its own output.
  // Set AZURE_BUILD=true in the Azure pipeline / App Service build settings.
  ...(process.env.AZURE_BUILD === "true" ? { output: "standalone" } : {}),

  experimental: {
    serverActions: {
      bodySizeLimit: "20mb",
    },
  },

  // SEC (H5): baseline hardening headers. HSTS is emitted by Azure Front Door /
  // App Service TLS termination in production, but set here so it holds on any host.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              // Next.js injects inline bootstrap/hydration scripts and the app uses
              // inline style objects throughout, so both need 'unsafe-inline'.
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob:",
              "font-src 'self' data:",
              "connect-src 'self'",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join("; "),
          },
        ],
      },
    ];
  },
  serverExternalPackages: [
    "better-sqlite3",
    "@prisma/adapter-better-sqlite3",
    "bcryptjs",
    "pg",
    "@prisma/adapter-pg",
    "pdf-parse",
    "pdfjs-dist",
    "mammoth",
    "pptxgenjs",
    "docx",
    "jszip",
  ],
};

export default nextConfig;
