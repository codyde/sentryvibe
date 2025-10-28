import type { Metadata } from "next";
import { Rubik } from "next/font/google";
import "./globals.css";
import { ProjectProvider } from "@/contexts/ProjectContext";
import { RunnerProvider } from "@/contexts/RunnerContext";
import { AgentProvider } from "@/contexts/AgentContext";

const rubik = Rubik({
  subsets: ["latin"],
  variable: "--font-rubik",
  weight: ["300", "400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "SentryVibe - AI Builds Projects, You Ship Faster",
  description: "Stop copy-pasting boilerplate from Stack Overflow. AI agents scaffold complete web apps from prompts. Watch them work in real-time, preview with instant tunnels, and iterate until it's production-ready. Your commit history will thank you.",
  keywords: ["AI", "code generation", "project scaffolding", "developer tools", "automation", "web development", "productivity"],
  authors: [{ name: "Cody De Arkland" }],
  creator: "Cody De Arkland",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://github.com/codyde/sentryvibe",
    title: "SentryVibe - AI That Actually Writes Your Boilerplate",
    description: "Describe what you need. AI scaffolds it. You ship faster. Real-time streaming, instant previews, and zero npm create pain.",
    siteName: "SentryVibe",
  },
  twitter: {
    card: "summary_large_image",
    title: "SentryVibe - Because You Have Better Things to Build",
    description: "AI agents handle the boring setup so you can focus on what actually matters. From prompt to preview in minutes.",
    creator: "@codydearkland",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${rubik.variable} font-sans antialiased`}
      >
        <AgentProvider>
          <RunnerProvider>
            <ProjectProvider>
              {children}
            </ProjectProvider>
          </RunnerProvider>
        </AgentProvider>
      </body>
    </html>
  );
}
