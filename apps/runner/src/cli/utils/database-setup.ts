import { spawn } from 'child_process';
import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { logger } from './logger.js';
import { spinner } from './spinner.js';
import { prompts } from './prompts.js';

/**
 * Read DATABASE_URL from .env file in monorepo root
 */
export async function readDatabaseUrlFromEnv(monorepoPath: string): Promise<string | null> {
  const envPath = join(monorepoPath, '.env');

  if (!existsSync(envPath)) {
    return null;
  }

  try {
    const content = await readFile(envPath, 'utf-8');
    const match = content.match(/^DATABASE_URL\s*=\s*['"]?([^'"\n]+)['"]?/m);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

/**
 * Clear DATABASE_URL from .env file (removes stale value)
 */
export async function clearDatabaseUrlFromEnv(monorepoPath: string): Promise<void> {
  const envPath = join(monorepoPath, '.env');

  if (!existsSync(envPath)) {
    return;
  }

  try {
    const content = await readFile(envPath, 'utf-8');
    const updated = content
      .split('\n')
      .filter(line => !line.trim().startsWith('DATABASE_URL'))
      .join('\n');
    await writeFile(envPath, updated, 'utf-8');
  } catch (error) {
    logger.warn('Could not clear DATABASE_URL from .env');
  }
}

/**
 * Run neondb setup to create a database and get the connection string
 * Returns the DATABASE_URL if successful
 */
export async function setupDatabase(monorepoPath: string): Promise<string | null> {
  // Clear any stale DATABASE_URL first
  await clearDatabaseUrlFromEnv(monorepoPath);

  spinner.start('Setting up Neon PostgreSQL database...');

  return new Promise((resolve) => {
    const proc = spawn('npx', ['neondb', '-y'], {
      cwd: monorepoPath, // Run in monorepo root so .env is created there
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
    });

    let databaseUrl: string | null = null;
    let output = '';

    proc.stdout?.on('data', (data) => {
      const text = data.toString();
      output += text;

      // Look for DATABASE_URL in the output
      const match = text.match(/DATABASE_URL[=:]?\s*['"]?([^'"\s]+)['"]?/);
      if (match && match[1]) {
        databaseUrl = match[1];
      }

      // Also check for postgres:// connection strings
      const connMatch = text.match(/(postgres(?:ql)?:\/\/[^\s'"]+)/);
      if (connMatch && connMatch[1]) {
        databaseUrl = connMatch[1];
      }
    });

    proc.stderr?.on('data', (data) => {
      const text = data.toString();
      // Only log actual errors
      if (text.includes('error') || text.includes('Error')) {
        logger.debug(text.trim());
      }
    });

    proc.on('exit', async (code) => {
      if (code === 0) {
        // Try to read DATABASE_URL from .env file (neondb writes it there)
        const urlFromEnv = await readDatabaseUrlFromEnv(monorepoPath);

        if (urlFromEnv) {
          databaseUrl = urlFromEnv;
          spinner.succeed('Database created successfully');
          resolve(databaseUrl);
        } else if (databaseUrl) {
          // Fallback to what we parsed from output
          spinner.succeed('Database created successfully');
          resolve(databaseUrl);
        } else {
          spinner.warn('Database command completed but DATABASE_URL not found');
          logger.info('Check .env file in monorepo root for DATABASE_URL');
          resolve(null);
        }
      } else {
        spinner.fail('Failed to create database');
        resolve(null);
      }
    });

    proc.on('error', (error) => {
      spinner.fail('Failed to run neondb');
      logger.error(`Error: ${error.message}`);
      resolve(null);
    });
  });
}

/**
 * Check if neondb is available
 */
export async function isNeondbAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn('npx', ['neondb', '--version'], {
      stdio: 'ignore',
      shell: true,
    });

    proc.on('exit', (code) => {
      resolve(code === 0);
    });

    proc.on('error', () => {
      resolve(false);
    });
  });
}

/**
 * Push database schema using drizzle-kit
 */
export async function pushDatabaseSchema(monorepoPath: string, databaseUrl: string): Promise<boolean> {
  const { join } = await import('path');
  const { existsSync } = await import('fs');

  const sentryvibeAppPath = join(monorepoPath, 'apps/sentryvibe');
  const configPath = join(sentryvibeAppPath, 'drizzle.config.ts');

  // Verify paths exist
  if (!existsSync(sentryvibeAppPath)) {
    logger.error(`Directory not found: ${sentryvibeAppPath}`);
    return false;
  }

  if (!existsSync(configPath)) {
    logger.error(`Drizzle config not found: ${configPath}`);
    return false;
  }

  spinner.start('Initializing database schema (this may take a moment)...');

  return new Promise((resolve) => {
    const proc = spawn('npx', ['drizzle-kit', 'push', '--config=drizzle.config.ts'], {
      cwd: sentryvibeAppPath,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl, // Ensure drizzle-kit has access
      },
    });

    let hasError = false;
    let errorOutput = '';

    // Suppress normal output, only capture errors
    proc.stdout?.on('data', () => {
      // Silently consume stdout
    });

    proc.stderr?.on('data', (data) => {
      const text = data.toString();
      if (text.includes('error') || text.includes('Error')) {
        hasError = true;
        errorOutput += text;
      }
    });

    proc.on('exit', (code) => {
      if (code === 0 && !hasError) {
        spinner.succeed('Database schema initialized successfully');
        resolve(true);
      } else {
        spinner.fail('Failed to push database schema');
        if (errorOutput) {
          logger.error(errorOutput.trim());
        }
        resolve(false);
      }
    });

    proc.on('error', (error) => {
      spinner.fail('Failed to run drizzle-kit');
      logger.error(`Error: ${error.message}`);
      resolve(false);
    });
  });
}

/**
 * Connect to an existing database manually by prompting for connection string
 */
export async function connectManualDatabase(): Promise<string | null> {
  logger.log('');

  // Ask user what type of connection they want
  const connectionType = await prompts.select(
    'How would you like to connect your database?',
    [
      'Connect an existing Sentryvibe database',
      'Provide a connection string directly',
    ]
  );

  logger.log('');

  // Prompt for the connection string
  let message: string;
  if (connectionType === 'Connect an existing Sentryvibe database') {
    message = 'Enter your Sentryvibe database connection string:';
  } else {
    message = 'Enter your PostgreSQL connection string:';
  }

  const connectionString = await prompts.input(message);

  // Basic validation
  if (!connectionString || connectionString.trim() === '') {
    logger.error('Connection string cannot be empty');
    return null;
  }

  // Validate it looks like a PostgreSQL connection string
  if (!connectionString.match(/^postgres(?:ql)?:\/\//)) {
    logger.error('Connection string must start with postgres:// or postgresql://');
    return null;
  }

  return connectionString.trim();
}

