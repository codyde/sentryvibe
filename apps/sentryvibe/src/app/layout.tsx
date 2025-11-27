import type { Metadata } from "next";
import { Rubik } from "next/font/google";
import "./globals.css";
import { ProjectProvider } from "@/contexts/ProjectContext";
import { RunnerProvider } from "@/contexts/RunnerContext";
import { AgentProvider } from "@/contexts/AgentContext";
import { QueryProvider } from "./providers";
import { ToastProvider } from "@/components/ui/toast";

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
          <AgentProvider>
            <RunnerProvider>
              <ProjectProvider>
                <ToastProvider>
                  {children}
                </ToastProvider>
              </ProjectProvider>
            </RunnerProvider>
          </AgentProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
