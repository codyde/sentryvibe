"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.Sentry = void 0;
const Sentry = __importStar(require("@sentry/node"));
exports.Sentry = Sentry;
const profiling_node_1 = require("@sentry/profiling-node");
// Initialize Sentry FIRST before any other imports
Sentry.init({
    dsn: process.env.SENTRY_DSN || 'https://14836e3c83b298b446f1f27df5d9972f@o4508130833793024.ingest.us.sentry.io/4510251614339072',
    // Profiling
    profilesSampleRate: 1.0,
    integrations: [
        (0, profiling_node_1.nodeProfilingIntegration)(),
        Sentry.httpIntegration(), // For HTTP trace propagation
    ],
    // Use tracesSampler instead of tracesSampleRate for granular control
    tracesSampler: ({ name }) => {
        // Never trace health/status/metrics endpoints - these are high-frequency monitoring
        if (name?.includes('/health') || name?.includes('/status') || name?.includes('/metrics')) {
            return 0;
        }
        // Sample everything else at 100%
        return 1.0;
    },
    // Configure trace propagation for outgoing HTTP to Next.js
    // This tells Sentry to automatically add trace headers to these URLs
    tracePropagationTargets: [
        // Local development
        'localhost',
        'localhost:3000',
        /^https?:\/\/localhost:\d+$/,
        // Production domains
        'sentryvibe.app',
        'sentryvibe.up.railway.app',
        'broker.sentryvibe.app',
        'broker.up.railway.app',
        // Wildcard patterns for Railway
        /^https?:\/\/.*\.railway\.app/, // Railway deployments
        /^https?:\/\/.*\.up\.railway\.app/, // Railway preview deployments
        /^https?:\/\/.*\.sentryvibe\.app/, // Custom domain subdomains
        // Explicit target from environment variable
        ...(process.env.EVENT_TARGET ? [process.env.EVENT_TARGET] : []),
    ],
    // Environment
    environment: process.env.NODE_ENV || 'development',
    // Send user IP and other PII for better debugging (disable if privacy-sensitive)
    sendDefaultPii: true,
    // Release tracking (optional - useful for correlating errors with deployments)
    release: process.env.SENTRY_RELEASE || undefined,
});
