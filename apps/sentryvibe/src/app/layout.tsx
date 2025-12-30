import type { Metadata } from "next";
import { Rubik } from "next/font/google";
import "./globals.css";
import { ProjectProvider } from "@/contexts/ProjectContext";
import { RunnerProvider } from "@/contexts/RunnerContext";
import { AgentProvider } from "@/contexts/AgentContext";
import { AuthProvider } from "@/contexts/AuthContext";
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
  description: "Build projects with Claude Code",
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
        <QueryProvider>
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
        </QueryProvider>
      </body>
    </html>
  );
}
