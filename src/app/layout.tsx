import type { Metadata, Viewport } from "next";
import { Geist_Mono, Inter } from "next/font/google";
import { MotionProvider } from "@/components/motion";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const mono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "ShipCheck — Is your vibe-coded app safe to launch?", template: "%s · ShipCheck" },
  description: "A pre-launch safety audit for apps built with Lovable, Bolt, Cursor and Replit. Plain-English findings and copy-paste fix prompts for your AI agent.",
};

export const viewport: Viewport = { themeColor: "#000000", colorScheme: "dark" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} ${mono.variable} h-full`}>
      <body className="flex min-h-full flex-col">
        <MotionProvider>
          <SiteHeader />
          <main className="flex-1">{children}</main>
          <SiteFooter />
        </MotionProvider>
      </body>
    </html>
  );
}
