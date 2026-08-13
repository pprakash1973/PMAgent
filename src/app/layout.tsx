import type { Metadata } from "next";
import "./globals.css";
import { Inter } from "next/font/google";
import { Toaster } from "@/components/ui/toaster";
import { SessionProvider } from "@/components/session-provider";
import { CopilotProvider } from "@/components/copilot/CopilotContext";
import { CopilotPanel } from "@/components/copilot/CopilotPanel";

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "PM Agent — AI-Powered PMO Platform | UST",
  description: "Enterprise project management powered by AI. Generate artifacts, track health, and report status in minutes.",
  icons: { icon: "/favicon.ico" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`h-full antialiased ${inter.variable}`}>
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <SessionProvider>
          <CopilotProvider>
            {children}
            <CopilotPanel />
            <Toaster />
          </CopilotProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
