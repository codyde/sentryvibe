"use client";

import * as Sentry from "@sentry/nextjs";
import NextError from "next/error";
import { useEffect } from "react";

export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    // Detect module loading failures during Fast Refresh
    const isModuleLoadingError = 
      error.message?.includes("is not defined") ||
      error.message?.includes("Cannot find module") ||
      error.message?.includes("Module not found") ||
      error.stack?.includes("webpack-internal://");

    if (isModuleLoadingError) {
      // Enhance error context for module loading issues
      Sentry.captureException(error, {
        tags: {
          error_type: "module_loading_failure",
          likely_cause: "stale_build_cache"
        },
        contexts: {
          troubleshooting: {
            recommendation: "Clear Next.js build cache by running: npm run clean:cache",
            issue: "This error typically occurs when webpack references a deleted or moved file during Fast Refresh",
            solution: "Stop dev server, run 'npm run clean:cache', then restart dev server"
          }
        }
      });
      
      // Log helpful message to console for developers
      console.error(
        "🔴 Module Loading Error Detected\n\n" +
        "This error typically occurs when Next.js Fast Refresh references a file that was deleted or moved.\n\n" +
        "To fix this:\n" +
        "1. Stop the dev server (Ctrl+C)\n" +
        "2. Run: npm run clean:cache\n" +
        "3. Restart the dev server: npm run dev\n\n" +
        "Error details:",
        error
      );
    } else {
      Sentry.captureException(error);
    }
  }, [error]);

  return (
    <html>
      <body>
        {/* `NextError` is the default Next.js error page component. Its type
        definition requires a `statusCode` prop. However, since the App Router
        does not expose status codes for errors, we simply pass 0 to render a
        generic error message. */}
        <NextError statusCode={0} />
      </body>
    </html>
  );
}