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

  const requireFn: NodeRequire | undefined = typeof require === 'function' ? require : undefined;
  const loader = requireFn ? requireFn('./load-template-context.server.js') : eval('require')("./load-template-context.server.js");
  return loader.loadTemplateSelectionContext(context);
}
