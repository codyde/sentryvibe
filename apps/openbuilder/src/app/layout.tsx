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
const isLocalMode = process.env.OPENBUILDER_LOCAL_MODE === "true";

const rubik = Rubik({
  subsets: ["latin"],
  variable: "--font-rubik",
  weight: ["300", "400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "OpenBuilder - Think it. Build it. Ship it.",
  description: "Build and ship applications locally. Build cool things, prototype new ideas, break them, and fix it faster with Sentry.",
  metadataBase: new URL("https://openbuilder.app"),
  openGraph: {
    title: "OpenBuilder - Think it. Build it. Ship it.",
    description: "Build and ship applications locally. Build cool things, prototype new ideas, break them, and fix it faster with Sentry.",
    url: "https://openbuilder.app",
    siteName: "OpenBuilder",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "OpenBuilder - Think it. Build it. Ship it.",
    description: "Build and ship applications locally. Build cool things, prototype new ideas, break them, and fix it faster with Sentry.",
  },
  keywords: ["AI", "app builder", "code generation", "full-stack", "developer tools", "openbuilder"],
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
