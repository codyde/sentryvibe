"use client";

import { useState } from "react";
import { signIn, signUp } from "@/lib/auth-client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Mail, Lock, User, AlertCircle, ArrowLeft } from "lucide-react";

// Sentry logo SVG component (official mark) - white version for dark backgrounds
function SentryLogo({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 72 66"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M41.6,1.4c-1.7-1-3.9-1-5.6,0l-0.3,0.2l-0.3,0.2c-1,0.7-1.8,1.6-2.4,2.7l-0.2,0.3L3,59.2c-0.8,1.5-0.9,3.3-0.1,4.9l0.1,0.2l0.1,0.2c0.7,1.1,1.8,1.9,3.1,2.1l0.3,0l0.3,0c0.2,0,0.4,0,0.6,0l0.3,0l0.3,0l0.4,0h10.4c0.1-4.7,3.5-8.6,8.2-10.4c0.9-0.3,1.9-0.5,2.9-0.5c1.5,0,2.9,0.4,4.1,1l0.3,0.2l0.2,0.2l4.8-8.2l-0.2-0.2c-2.7-1.8-5.9-2.8-9.2-2.8c-9.7,0-17.6,7.3-18.6,16.6l-0.1,0.7l0,0.7h0c0,0,0,0,0,0l0-0.4l0.1-0.4c0.7-6.6,5.7-12,12-13.4l0.5-0.1l0.5,0h0.1c0.3,0,0.6,0,0.9,0l0.5,0.1l0.5,0.1c3.8,1,7.1,3.3,9.2,6.5l0.2,0.3l0.2,0.3l4.8-8.2l-0.2-0.2c-3.7-3.5-8.5-6.1-14-6.8l-0.6-0.1l-0.6,0c-10.5,0-19.6,7.8-21.4,18.1l-0.1,0.7l-0.1,0.8c0,0.4,0,0.9,0.1,1.3l0.1,0.5l0.1,0.5h-3l-0.1-0.5l-0.1-0.5c-0.1-0.9-0.1-1.9,0.1-2.8l0.1-0.6l0.2-0.5L31.2,4.3l0.1-0.3l0.3-0.4c1-1.4,2.5-2.5,4.2-2.9l0.3-0.1l0.4-0.1c1.9-0.3,3.9,0.1,5.5,1.1l0.3,0.2l0.2,0.2l27.3,49.1c0.2,0.3,0.4,0.7,0.5,1.1l0.1,0.4l0.1,0.5c0.1,0.9-0.1,1.8-0.5,2.6l-0.2,0.3l-0.3,0.3l-4.8,8.2l-0.3,0.3l-0.3,0.3c-0.8,0.5-1.6,0.9-2.5,1l-0.4,0l-0.5,0H50.1c-0.9-4.7-4.2-8.6-8.9-10.4l-0.4-0.1l-0.4-0.1c-1.1-0.2-2.3-0.3-3.5-0.3c-1.5,0-2.9,0.4-4.1,1l-0.3,0.2l-0.2,0.2l-4.9-8.2l0.2-0.2c2.8-1.8,6-2.8,9.3-2.8c9.7,0,17.6,7.3,18.6,16.6l0.1,0.7l0,0.7h0c0,0,0,0,0,0l0-0.4l-0.1-0.4c-0.7-6.6-5.7-12-12-13.4l-0.5-0.1l-0.5,0h-0.1c-0.3,0-0.6,0-0.9,0l-0.5,0.1l-0.5,0.1c-3.8,1-7.1,3.3-9.2,6.5l-0.2,0.3l-0.2,0.3l-4.8-8.2l0.2-0.2c3.7-3.5,8.5-6.1,14-6.8l0.6-0.1l0.6,0c10.5,0,19.6,7.8,21.4,18.1l0.1,0.7l0.1,0.8c0,0.4,0,0.9-0.1,1.3l-0.1,0.5l-0.1,0.5h3l0.1-0.5l0.1-0.5c0.1-0.9,0.1-1.9-0.1-2.8l-0.1-0.6l-0.2-0.5L37.8,4.3l-0.1-0.3l-0.3-0.4c-1-1.4-2.5-2.5-4.2-2.9l-0.3-0.1L32.5,0.5c-1.9-0.3-3.9,0.1-5.5,1.1l-0.3,0.2l-0.2,0.2" />
    </svg>
  );
}

interface LoginModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

type Mode = "login" | "signup";
type AuthMethod = "sentry" | "email";

export function LoginModal({ open, onOpenChange, onSuccess }: LoginModalProps) {
  const [mode, setMode] = useState<Mode>("login");
  const [authMethod, setAuthMethod] = useState<AuthMethod>("sentry");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSentryLoading, setIsSentryLoading] = useState(false);

  const resetForm = () => {
    setEmail("");
    setPassword("");
    setName("");
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      if (mode === "login") {
        const result = await signIn.email({
          email,
          password,
        });

        if (result.error) {
          setError(result.error.message || "Invalid email or password");
          return;
        }
      } else {
        // Validate password requirements
        if (password.length < 8) {
          setError("Password must be at least 8 characters");
          return;
        }

        if (!/[A-Z]/.test(password)) {
          setError("Password must contain at least one uppercase letter");
          return;
        }

        if (!/[a-z]/.test(password)) {
          setError("Password must contain at least one lowercase letter");
          return;
        }

        if (!/[0-9]/.test(password)) {
          setError("Password must contain at least one number");
          return;
        }

        const result = await signUp.email({
          email,
          password,
          name: name || email.split("@")[0],
        });

        if (result.error) {
          setError(result.error.message || "Failed to create account");
          return;
        }
      }

      // Success - close modal and call callback
      resetForm();
      onOpenChange(false);
      onSuccess?.();
    } catch (err) {
      console.error("Auth error:", err);
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const toggleMode = () => {
    setMode(mode === "login" ? "signup" : "login");
    setError(null);
  };

  const handleSentryLogin = async () => {
    setError(null);
    setIsSentryLoading(true);
    try {
      await signIn.oauth2({
        providerId: "sentry",
        callbackURL: "/",
      });
    } catch (err) {
      console.error("Sentry OAuth error:", err);
      setError("Failed to initiate Sentry login. Please try again.");
      setIsSentryLoading(false);
    }
  };

  const handleBackToSentry = () => {
    setAuthMethod("sentry");
    setError(null);
    resetForm();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-zinc-950 border-zinc-800">
        <DialogHeader>
          <DialogTitle className="text-xl text-white">
            {mode === "login" ? "Welcome back" : "Create an account"}
          </DialogTitle>
          <DialogDescription className="text-zinc-400">
            {mode === "login"
              ? "Sign in to your account to continue"
              : "Sign up to start building with SentryVibe"}
          </DialogDescription>
        </DialogHeader>

        {authMethod === "sentry" ? (
          <>
            {/* Sentry OAuth Button - Primary Auth Method */}
            <div className="mt-4">
              <Button
                type="button"
                onClick={handleSentryLogin}
                disabled={isSentryLoading || isLoading}
                className="w-full bg-[#2b2233] hover:bg-[#3d3347] text-white border-0"
              >
                {isSentryLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Connecting to Sentry...
                  </>
                ) : (
                  <>
                    <SentryLogo className="h-5 w-5 mr-2" />
                    Sign in with Sentry
                  </>
                )}
              </Button>
            </div>

            {/* Divider */}
            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-zinc-800" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-zinc-950 px-2 text-zinc-500">or</span>
              </div>
            </div>

            {/* Email/Password Button */}
            <Button
              type="button"
              variant="outline"
              onClick={() => setAuthMethod("email")}
              disabled={isSentryLoading}
              className="w-full bg-transparent border-zinc-700 hover:bg-zinc-900 hover:border-zinc-600 text-zinc-300"
            >
              <Mail className="h-4 w-4 mr-2" />
              Email / Password
            </Button>
          </>
        ) : (
          <>
            {/* Back button */}
            <button
              type="button"
              onClick={handleBackToSentry}
              className="flex items-center gap-1 text-sm text-zinc-400 hover:text-white transition-colors mt-2 mb-4"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to sign in options
            </button>

            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === "signup" && (
                <div className="space-y-2">
                  <label
                    htmlFor="name"
                    className="text-sm font-medium text-zinc-300"
                  >
                    Name
                  </label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                    <Input
                      id="name"
                      type="text"
                      placeholder="Your name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="pl-10 bg-zinc-900 border-zinc-800 text-white placeholder:text-zinc-500"
                    />
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <label
                  htmlFor="email"
                  className="text-sm font-medium text-zinc-300"
                >
                  Email
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="pl-10 bg-zinc-900 border-zinc-800 text-white placeholder:text-zinc-500"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label
                  htmlFor="password"
                  className="text-sm font-medium text-zinc-300"
                >
                  Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                  <Input
                    id="password"
                    type="password"
                    placeholder={mode === "signup" ? "Min 8 characters" : "Enter your password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={8}
                    className="pl-10 bg-zinc-900 border-zinc-800 text-white placeholder:text-zinc-500"
                  />
                </div>
                {mode === "signup" && (
                  <p className="text-xs text-zinc-500">
                    Must include uppercase, lowercase, and a number
                  </p>
                )}
              </div>

              {error && (
                <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                  <AlertCircle className="h-4 w-4 text-red-400 shrink-0" />
                  <p className="text-sm text-red-400">{error}</p>
                </div>
              )}

              <Button
                type="submit"
                disabled={isLoading}
                className="w-full btn-theme-primary"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {mode === "login" ? "Signing in..." : "Creating account..."}
                  </>
                ) : mode === "login" ? (
                  "Sign in"
                ) : (
                  "Create account"
                )}
              </Button>
            </form>

            <div className="mt-4 text-center">
              <button
                type="button"
                onClick={toggleMode}
                className="text-sm text-zinc-400 hover:text-white transition-colors"
              >
                {mode === "login" ? (
                  <>
                    Don&apos;t have an account?{" "}
                    <span className="text-theme-primary hover:text-theme-accent">Sign up</span>
                  </>
                ) : (
                  <>
                    Already have an account?{" "}
                    <span className="text-theme-primary hover:text-theme-accent">Sign in</span>
                  </>
                )}
              </button>
            </div>
          </>
        )}

        {/* Error display for Sentry auth */}
        {authMethod === "sentry" && error && (
          <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg mt-4">
            <AlertCircle className="h-4 w-4 text-red-400 shrink-0" />
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
