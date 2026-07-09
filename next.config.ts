import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "better-sqlite3",
    "@prisma/adapter-better-sqlite3",
    "bcryptjs",
    "pg",
    "@prisma/adapter-pg",
    "pdf-parse",
    "mammoth",
    "pptxgenjs",
    "docx",
    "jszip",
  ],
};

export default nextConfig;
