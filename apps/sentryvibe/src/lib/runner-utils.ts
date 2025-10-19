import { listRunnerConnections } from '@sentryvibe/agent-core/lib/runner/broker-state';

/**
 * Get the ID of an active runner connection.
 * Uses first available runner as fallback.
 *
 * @returns The runner ID to use, or null if no runners are connected
 */
export async function getActiveRunnerId(): Promise<string | null> {
  const connections = await listRunnerConnections();

  if (connections.length === 0) {
    return null;
  }

  // Use first available runner (connections have 'runnerId' not 'id')
  return connections[0].runnerId;
}

/**
 * Get the runner ID for a project, with fallback to any available runner.
 * Tries to use the project's saved runnerId first (if that runner is still connected),
 * otherwise falls back to the first available runner.
 *
 * @param preferredRunnerId - The preferred runner ID (e.g., from project.runnerId)
 * @returns The runner ID to use, or null if no runners are connected
 */
export async function getProjectRunnerId(preferredRunnerId: string | null): Promise<string | null> {
  const connections = await listRunnerConnections();

  console.log('🔍 [getProjectRunnerId] Connections:', connections);
  console.log('🔍 [getProjectRunnerId] Preferred runner:', preferredRunnerId);

  if (connections.length === 0) {
    console.warn('⚠️  [getProjectRunnerId] No connections found');
    return null;
  }

  // If project has a saved runnerId and that runner is connected, use it
  // Note: connections have 'runnerId' property, not 'id'
  if (preferredRunnerId) {
    const preferredConnection = connections.find(conn => conn.runnerId === preferredRunnerId);
    if (preferredConnection) {
      console.log(`✅ [getProjectRunnerId] Using preferred runner: ${preferredConnection.runnerId}`);
      return preferredConnection.runnerId;
    }
    console.warn(`⚠️  Project's runner '${preferredRunnerId}' not connected, using fallback`);
  }

  // Fallback to first available runner
  console.log(`✅ [getProjectRunnerId] Using fallback runner: ${connections[0].runnerId}`);
  return connections[0].runnerId;
}
