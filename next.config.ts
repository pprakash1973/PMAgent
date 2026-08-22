import type { NextConfig } from "next";

// Content-Security-Policy, shipped in Report-Only first.
//
// It cannot be enforced yet: /api/public-submit/[token] serves a standalone HTML page
// with an inline <script>, and the artifact print path writes inline styles into a new
// window. Enforcing script-src 'self' today would break both. Report-Only surfaces every
// violation in the browser console without blocking, so the inline blocks can be moved to
// nonces or external files first. Switch the key to "Content-Security-Policy" once the
// report is clean.
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy-Report-Only", value: csp },
  { key: "X-Frame-Options",           value: "DENY" },
  { key: "X-Content-Type-Options",    value: "nosniff" },
  { key: "X-XSS-Protection",          value: "1; mode=block" },
  { key: "Referrer-Policy",           value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy",        value: "camera=(), microphone=(), geolocation=()" },
  // HSTS: only send in production (HTTP in dev breaks the header)
  ...(process.env.NODE_ENV === "production"
    ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }]
    : []),
];

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "20mb",
    },
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
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
