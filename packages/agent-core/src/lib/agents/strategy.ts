import type { AgentId } from '../../types/agent';
import type { DesignPreferences } from '../../types/design';
import type { AppliedTag } from '../../types/tags';

export interface AgentStrategyContext {
  projectId: string;
  projectName: string;
  prompt: string;
  workingDirectory: string;
  operationType: string;
  isNewProject: boolean;
  skipTemplates?: boolean;
  workspaceRoot?: string;
  fileTree?: string;
  templateName?: string;
  templateFramework?: string;
  templateSelectionContext?: string;
  templateMetadata?: {
    id?: string;
    repository?: string;
    branch?: string;
    rationale?: string;
    confidence?: number;
  };
  designPreferences?: DesignPreferences; // User-specified design constraints (deprecated - use tags)
  tags?: AppliedTag[]; // Tag-based configuration system
}

export interface AgentStrategy {
  buildSystemPromptSections(context: AgentStrategyContext): Promise<string[]> | string[];
  buildFullPrompt(context: AgentStrategyContext, basePrompt: string): Promise<string> | string;
  shouldDownloadTemplate(context: AgentStrategyContext): boolean;
  resolveWorkingDirectory?(context: AgentStrategyContext): string;
  postTemplateSelected?(context: AgentStrategyContext, template: { name: string; framework?: string; fileTree?: string }): void;
  processRunnerEvent?<State>(state: State, event: any): State;
  getTemplateSelectionContext?(context: AgentStrategyContext): Promise<string | undefined> | string | undefined;
}

const strategyRegistry = new Map<AgentId, AgentStrategy>();

export function registerAgentStrategy(agentId: AgentId, strategy: AgentStrategy) {
  strategyRegistry.set(agentId, strategy);
}

export function getAgentStrategy(agentId: AgentId): AgentStrategy {
  const strategy = strategyRegistry.get(agentId);
  if (!strategy) {
    throw new Error(`No strategy registered for agent: ${agentId}`);
  }
  return strategy;
}
