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

  const { getTemplateSelectionContext } = await import('./config.server.js');
  return getTemplateSelectionContext();
}
