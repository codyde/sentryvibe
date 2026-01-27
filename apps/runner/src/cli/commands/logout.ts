import chalk from 'chalk';
import { hasStoredToken, clearToken } from '../utils/cli-auth.js';
import { logger } from '../utils/logger.js';

/**
 * Logout command - clear stored credentials
 * 
 * Usage:
 *   openbuilder logout
 * 
 * This command clears the locally stored runner token.
 * The token remains valid on the server - you can revoke it
 * from the OpenBuilder dashboard if needed.
 */
export async function logoutCommand() {
  logger.section('OpenBuilder Logout');
  
  if (!hasStoredToken()) {
    logger.info('Not currently logged in.');
    return;
  }
  
  clearToken();
  
  logger.success('Logged out successfully.');
  logger.info('');
  logger.info('Note: The runner token is still valid on the server.');
  logger.info('To revoke it, visit your OpenBuilder dashboard.');
  logger.info('');
  logger.info(`Run ${chalk.cyan('openbuilder login')} to authenticate again.`);
}
