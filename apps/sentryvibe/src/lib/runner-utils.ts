import { listRunnerConnections } from '@sentryvibe/agent-core/lib/runner/broker-state';

/**
 * Get the runner ID for a project - NO FALLBACK.
 * If the project has a saved runnerId, that specific runner must be connected.
 * If the project has no runnerId (new project), uses the first available runner.
 *
 * @param preferredRunnerId - The project's saved runner ID (from project.runnerId)
 * @returns The runner ID if available, or null if the required runner is not connected
 */
export async function getProjectRunnerId(preferredRunnerId: string | null): Promise<string | null> {
  const connections = await listRunnerConnections();

  console.log('🔍 [getProjectRunnerId] Connections:', connections);
  console.log('🔍 [getProjectRunnerId] Project runner:', preferredRunnerId);

  if (connections.length === 0) {
    console.warn('⚠️  [getProjectRunnerId] No runners connected');
    return null;
  }

  // If project has a saved runnerId, that specific runner MUST be connected
  // No fallback - the project is tied to its runner
  if (preferredRunnerId) {
    const projectRunner = connections.find(conn => conn.runnerId === preferredRunnerId);
    if (projectRunner) {
      console.log(`✅ [getProjectRunnerId] Project runner connected: ${projectRunner.runnerId}`);
      return projectRunner.runnerId;
    }
    // Project's runner is not connected - return null (no fallback)
    console.warn(`⚠️  [getProjectRunnerId] Project runner '${preferredRunnerId}' is not connected`);
    return null;
  }

  // No saved runnerId (new project) - use first available runner
  console.log(`✅ [getProjectRunnerId] New project, using runner: ${connections[0].runnerId}`);
  return connections[0].runnerId;
}
