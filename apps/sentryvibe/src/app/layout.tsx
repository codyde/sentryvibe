import type { Metadata } from "next";
import { Rubik } from "next/font/google";
import "./globals.css";
import { ProjectProvider } from "@/contexts/ProjectContext";
import { RunnerProvider } from "@/contexts/RunnerContext";
import { AgentProvider } from "@/contexts/AgentContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { QueryProvider } from "./providers";
import { ToastProvider } from "@/components/ui/toast";

// Check if running in local mode (set by runner)
const isLocalMode = process.env.SENTRYVIBE_LOCAL_MODE === "true";

const rubik = Rubik({
  subsets: ["latin"],
  variable: "--font-rubik",
  weight: ["300", "400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "SentryVibe",
  description: "Stop copy-pasting from ChatGPT. SentryVibe builds full-stack apps from your prompts - code that actually runs, not code you have to fix.",
  metadataBase: new URL("https://sentryvibe.app"),
  openGraph: {
    title: "SentryVibe - AI that writes code you won't have to fix",
    description: "Stop copy-pasting from ChatGPT. Describe what you want, get a working app. Built by devs who got tired of debugging AI-generated spaghetti.",
    url: "https://sentryvibe.app",
    siteName: "SentryVibe",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "SentryVibe - AI that writes code you won't have to fix",
    description: "Stop copy-pasting from ChatGPT. Describe what you want, get a working app. Built by devs who got tired of debugging AI-generated spaghetti.",
  },
  keywords: ["AI", "app builder", "code generation", "full-stack", "developer tools", "Sentry", "vibe coding"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark theme-sentry">
      <body
        className={`${rubik.variable} font-sans antialiased`}
      >
        <QueryProvider>
          <ThemeProvider>
            <AuthProvider isLocalMode={isLocalMode}>
              <AgentProvider>
                <RunnerProvider>
                  <ProjectProvider>
                    <ToastProvider>
                      {children}
                    </ToastProvider>
                  </ProjectProvider>
                </RunnerProvider>
              </AgentProvider>
            </AuthProvider>
          </ThemeProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
