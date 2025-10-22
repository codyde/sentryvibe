import { createConnection } from 'net';


// Silent mode for TUI
let isSilentMode = false;

export function setSilentMode(silent: boolean): void {
  isSilentMode = silent;
}

/**
 * Check if a port is actually listening and ready to accept connections
 * @param port The port to check
 * @param host The host to check (default: localhost)
 * @param timeoutMs Timeout in milliseconds (default: 1000)
 * @returns Promise that resolves to true if port is ready, false otherwise
 */
export async function isPortReady(
  port: number,
  host: string = 'localhost',
  timeoutMs: number = 1000
): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ port, host });

    const cleanup = () => {
      socket.destroy();
    };

    const timeout = setTimeout(() => {
      cleanup();
      resolve(false);
    }, timeoutMs);

    socket.on('connect', () => {
      clearTimeout(timeout);
      cleanup();
      resolve(true);
    });

    socket.on('error', () => {
      clearTimeout(timeout);
      cleanup();
      resolve(false);
    });
  });
}

/**
 * Wait for a port to become ready with retries
 * @param port The port to check
 * @param maxRetries Maximum number of retries (default: 10)
 * @param delayMs Delay between retries in milliseconds (default: 500)
 * @returns Promise that resolves to true if port becomes ready, false otherwise
 */
export async function waitForPort(
  port: number,
  maxRetries: number = 10,
  delayMs: number = 500
): Promise<boolean> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    if (await isPortReady(port)) {
      if (!isSilentMode) console.log(`✅ Port ${port} is ready (attempt ${attempt}/${maxRetries})`);
      return true;
    }

    if (attempt < maxRetries) {
      if (!isSilentMode) console.log(`⏳ Port ${port} not ready yet, retrying in ${delayMs}ms... (${attempt}/${maxRetries})`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  if (!isSilentMode) console.error(`❌ Port ${port} never became ready after ${maxRetries} attempts`);
  return false;
}
