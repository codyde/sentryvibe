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
import { Loader2, Mail, Lock, User, AlertCircle } from "lucide-react";

// Sentry logo SVG component (official mark)
function SentryLogo({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 222 66"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M39.8,57.5c0,0-1.2-0.9-3.4-0.9c-4.4,0-7.3,3.5-7.3,7.8H24c0-6.5,5-11.7,11.5-11.7c3.1,0,5.5,1.1,5.5,1.1l4.7-8.1 c0,0-3.5-2-10.2-2c-11.4,0-20.7,9-20.7,20.4v0.3H5.6c0,0-0.1-0.2,0-0.3c0-16.9,13.6-30.9,30.3-31.5c0.6,0,1.1,0,1.7,0 c5.5,0,10.8,1.4,15.2,4l4.7-8.2c-5.8-3.5-12.5-5.5-19.8-5.5c-0.7,0-1.4,0-2.1,0C15.2,23.3,0.1,38.7,0,59.1v5.4h9.4v-5.4 c0-0.1,0-0.2,0-0.3c0-4,0.6-7.9,1.7-11.4l-6.9,12c-0.9,1.5-0.4,3.5,1.2,4.4c0.5,0.3,1.1,0.4,1.7,0.4h5.9c0.1,0,0.2,0,0.3,0h28.1 c0.2,0,0.4,0,0.6,0c1.8,0,3.2-1.4,3.2-3.2c0-0.6-0.2-1.2-0.5-1.7L39.8,57.5z" />
    </svg>
  );
}

interface LoginModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

type Mode = "login" | "signup";

export function LoginModal({ open, onOpenChange, onSuccess }: LoginModalProps) {
  const [mode, setMode] = useState<Mode>("login");
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

        {/* Sentry OAuth Button - Primary Auth Method */}
        <div className="mt-4">
          <Button
            type="button"
            onClick={handleSentryLogin}
            disabled={isSentryLoading || isLoading}
            className="w-full bg-[#362d59] hover:bg-[#4a3d7a] text-white border-0"
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
            <span className="bg-zinc-950 px-2 text-zinc-500">
              or continue with email
            </span>
          </div>
        </div>

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
      </DialogContent>
    </Dialog>
  );
}
