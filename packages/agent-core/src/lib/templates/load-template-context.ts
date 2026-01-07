import type { AgentStrategyContext } from '../agents/strategy';

export async function loadTemplateSelectionContext(
  context: Pick<AgentStrategyContext, 'templateSelectionContext'>
): Promise<string | undefined> {
  if (context.templateSelectionContext) {
    return context.templateSelectionContext;
  }

  if (typeof window !== 'undefined') {
    return undefined;
  }

  // Use dynamic ESM import instead of CommonJS require
  // This ensures we get the same module instance that setTemplatesPath() configured
  const loader = await import('./load-template-context.server.js');
  return loader.loadTemplateSelectionContext(context);
}
