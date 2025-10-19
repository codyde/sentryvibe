import { listRunnerConnections } from '@sentryvibe/agent-core/lib/runner/broker-state';

/**
 * Get the ID of an active runner connection.
 * Uses first available runner (since projects don't track which runner was used yet).
 *
 * TODO: Add runnerId field to projects table to track which runner was used for each project.
 * This will enable proper multi-runner support where deletion uses the same runner as creation.
 *
 * @returns The runner ID to use, or null if no runners are connected
 */
export async function getActiveRunnerId(): Promise<string | null> {
  const connections = await listRunnerConnections();

  if (connections.length === 0) {
    return null;
  }

  // For now, just use the first available runner
  // In the future, projects should store which runner they were created with
  return connections[0].id;
}
