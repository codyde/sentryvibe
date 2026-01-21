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
  description: "AI-powered app builder. Describe your idea, watch it come to life. Build full-stack applications with natural language.",
  metadataBase: new URL("https://sentryvibe.app"),
  openGraph: {
    title: "SentryVibe - AI App Builder",
    description: "Describe your idea, watch it come to life. Build full-stack applications with natural language in minutes.",
    url: "https://sentryvibe.app",
    siteName: "SentryVibe",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "SentryVibe - AI App Builder",
    description: "Describe your idea, watch it come to life. Build full-stack applications with natural language in minutes.",
  },
  keywords: ["AI", "app builder", "code generation", "full-stack", "natural language", "developer tools", "Sentry"],
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
