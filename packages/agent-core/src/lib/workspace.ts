import { mkdirSync } from 'fs';

let cachedRoot: string | null = null;

export function getWorkspaceRoot(): string {
  if (cachedRoot) return cachedRoot;

  const envRoot = process.env.WORKSPACE_ROOT || process.env.RUNNER_WORKSPACE_ROOT;
  const defaultRoot = process.cwd();

  const root = envRoot && envRoot.trim().length > 0 ? envRoot : defaultRoot;

  try {
    mkdirSync(root, { recursive: true });
  } catch (error) {
    console.warn('⚠️  Failed to ensure workspace root exists:', error);
  }

  cachedRoot = root;
  return root;
}
