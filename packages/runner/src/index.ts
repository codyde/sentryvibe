/**
 * @openbuilder/runner - Lightweight runner package
 *
 * This package bundles the runner functionality from @openbuilder/cli
 * for a smaller package size when you only need the runner.
 */

// Re-export the startRunner function and types from the CLI source
// These imports are resolved by the alias plugin at build time
export { startRunner } from '@openbuilder/cli/index.js';
export type { RunnerOptions } from '@openbuilder/cli/index.js';

// Re-export runner command for CLI usage
export { runCommand } from '@openbuilder/cli/cli/commands/run.js';

// Re-export TUI components
export { RunnerDashboard } from '@openbuilder/cli/cli/tui/screens/RunnerDashboard.js';

// Re-export auth utilities
export {
  performOAuthLogin,
  hasStoredToken,
  getStoredToken,
  storeToken,
  clearToken,
  validateToken,
} from '@openbuilder/cli/cli/utils/cli-auth.js';

// Re-export config manager
export {
  configManager,
  type RunnerConfig,
} from '@openbuilder/cli/cli/utils/config-manager.js';
