"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import Image from "next/image";
import { signIn, useSession } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Loader2, Github, CheckCircle2, XCircle, Terminal } from "lucide-react";

type AuthState = "loading" | "login" | "authenticating" | "success" | "error";

export default function CLIAuthPage() {
  const searchParams = useSearchParams();
  const sessionToken = searchParams.get("session");
  const { data: session, isPending: isSessionLoading } = useSession();
  
  const [authState, setAuthState] = useState<AuthState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [isGitHubLoading, setIsGitHubLoading] = useState(false);
  const [isSentryLoading, setIsSentryLoading] = useState(false);

  // Check if we have a valid session token
  useEffect(() => {
    if (!sessionToken) {
      setAuthState("error");
      setError("Invalid authentication link. Please try again from the CLI.");
      return;
    }
    
    // If we're still loading the session, wait
    if (isSessionLoading) {
      return;
    }

    // If user is already logged in, complete the auth immediately
    if (session?.user) {
      completeAuth();
    } else {
      setAuthState("login");
    }
  }, [sessionToken, session, isSessionLoading]);

  const completeAuth = async () => {
    if (!sessionToken) return;
    
    setAuthState("authenticating");
    
    try {
      const response = await fetch("/api/auth/cli/callback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ sessionToken }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to complete authentication");
      }

      const data = await response.json();
      
      // Redirect to the CLI callback
      if (data.callbackUrl) {
        setAuthState("success");
        // Small delay to show success state before redirect
        setTimeout(() => {
          window.location.href = data.callbackUrl;
        }, 1500);
      } else {
        throw new Error("No callback URL received");
      }
    } catch (err) {
      console.error("Auth completion error:", err);
      setAuthState("error");
      setError(err instanceof Error ? err.message : "Authentication failed");
    }
  };

  const handleGitHubLogin = async () => {
    setIsGitHubLoading(true);
    setError(null);
    try {
      await signIn.oauth2({
        providerId: "github",
        callbackURL: `/auth/cli?session=${sessionToken}`,
      });
    } catch (err) {
      console.error("GitHub OAuth error:", err);
      setError("Failed to initiate GitHub login. Please try again.");
      setIsGitHubLoading(false);
    }
  };

  const handleSentryLogin = async () => {
    setIsSentryLoading(true);
    setError(null);
    try {
      await signIn.oauth2({
        providerId: "sentry",
        callbackURL: `/auth/cli?session=${sessionToken}`,
      });
    } catch (err) {
      console.error("Sentry OAuth error:", err);
      setError("Failed to initiate Sentry login. Please try again.");
      setIsSentryLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <Terminal className="h-12 w-12 text-theme-primary" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">
            CLI Authentication
          </h1>
          <p className="text-zinc-400">
            Sign in to connect OpenBuilder CLI to your account
          </p>
        </div>

        {/* Card */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6">
          {authState === "loading" && (
            <div className="flex flex-col items-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-theme-primary mb-4" />
              <p className="text-zinc-400">Checking authentication...</p>
            </div>
          )}

          {authState === "login" && (
            <>
              <p className="text-zinc-300 text-center mb-6">
                Choose a sign-in method to authorize the CLI
              </p>

              {/* OAuth Buttons */}
              <div className="space-y-3">
                <Button
                  onClick={handleGitHubLogin}
                  disabled={isGitHubLoading || isSentryLoading}
                  className="w-full bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-white"
                >
                  {isGitHubLoading ? (
                    <Loader2 className="h-5 w-5 animate-spin mr-2" />
                  ) : (
                    <Github className="h-5 w-5 mr-2" />
                  )}
                  Continue with GitHub
                </Button>

                <Button
                  onClick={handleSentryLogin}
                  disabled={isGitHubLoading || isSentryLoading}
                  className="w-full bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-white"
                >
                  {isSentryLoading ? (
                    <Loader2 className="h-5 w-5 animate-spin mr-2" />
                  ) : (
                    <Image
                      src="/sentryglyph.png"
                      alt="Sentry"
                      width={20}
                      height={20}
                      className="mr-2"
                    />
                  )}
                  Continue with Sentry
                </Button>
              </div>

              {error && (
                <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                  <p className="text-sm text-red-400">{error}</p>
                </div>
              )}
            </>
          )}

          {authState === "authenticating" && (
            <div className="flex flex-col items-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-theme-primary mb-4" />
              <p className="text-zinc-300 font-medium">Creating runner token...</p>
              <p className="text-zinc-500 text-sm mt-2">Please wait</p>
            </div>
          )}

          {authState === "success" && (
            <div className="flex flex-col items-center py-8">
              <CheckCircle2 className="h-12 w-12 text-green-500 mb-4" />
              <p className="text-zinc-300 font-medium text-lg">Authentication successful!</p>
              <p className="text-zinc-500 text-sm mt-2">
                Redirecting back to CLI...
              </p>
              <p className="text-zinc-600 text-xs mt-4">
                You can close this window after the redirect completes.
              </p>
            </div>
          )}

          {authState === "error" && (
            <div className="flex flex-col items-center py-8">
              <XCircle className="h-12 w-12 text-red-500 mb-4" />
              <p className="text-zinc-300 font-medium text-lg">Authentication failed</p>
              <p className="text-red-400 text-sm mt-2 text-center">
                {error || "An unknown error occurred"}
              </p>
              <p className="text-zinc-600 text-xs mt-4">
                Please close this window and try again from the CLI.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="mt-6 text-center">
          <p className="text-zinc-600 text-xs">
            This page was opened by the OpenBuilder CLI.
            <br />
            Only sign in if you initiated this from your terminal.
          </p>
        </div>
      </div>
    </div>
  );
}
