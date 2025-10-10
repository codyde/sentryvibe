import type { Metadata } from "next";
import { Rubik } from "next/font/google";
import "./globals.css";
import { ProjectProvider } from "@/contexts/ProjectContext";
import { RunnerProvider } from "@/contexts/RunnerContext";

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
        <RunnerProvider>
          <ProjectProvider>
            {children}
          </ProjectProvider>
        </RunnerProvider>
      </body>
    </html>
  );
}
