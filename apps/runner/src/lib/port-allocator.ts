/**
 * Simple local port allocator for the runner
 * Manages port assignments without database dependency
 */

const usedPorts = new Set<number>();

// Ports to avoid (reserved or commonly used)
const RESERVED_PORTS = new Set([
  6000, // X11
  5432, // Postgres
  3306, // MySQL
  27017, // MongoDB
  6379, // Redis
]);

/**
 * Allocate a free port from the available range
 */
export function allocatePort(): number {
  // Try ports from 3000-5999, 6001-9999
  const ranges = [
    { start: 3000, end: 5999 },
    { start: 6001, end: 9999 },
  ];

  for (const range of ranges) {
    for (let port = range.start; port <= range.end; port++) {
      if (!RESERVED_PORTS.has(port) && !usedPorts.has(port)) {
        usedPorts.add(port);
        console.log(`[port-allocator] Allocated port: ${port}`);
        return port;
      }
    }
  }

  throw new Error('No available ports in range 3000-9999');
}

/**
 * Release a port back to the pool
 */
export function releasePort(port: number): void {
  usedPorts.delete(port);
  console.log(`[port-allocator] Released port: ${port}`);
}

/**
 * Get all currently allocated ports
 */
export function getAllocatedPorts(): number[] {
  return Array.from(usedPorts);
}
