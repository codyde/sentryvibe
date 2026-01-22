/**
 * Prompt Builder - Composes sections into final system prompts
 */
import {
  IDENTITY,
  WORKFLOW,
  VERIFICATION,
  CODE_QUALITY,
  EXISTING_PROJECTS,
} from './sections/base';
import { DESIGN_PRINCIPLES } from './sections/design';
import { COMMUNICATION } from './sections/communication';
import { CLAUDE_TODO_TRACKING, CLAUDE_PLAN_MODE } from './agents/claude';
import { CODEX_TASK_TRACKING, CODEX_BASH_CONVENTIONS } from './agents/codex';

const SHARED_SECTIONS = [
  IDENTITY,
  WORKFLOW,
  VERIFICATION,
  DESIGN_PRINCIPLES,
  COMMUNICATION,
  EXISTING_PROJECTS,
  CODE_QUALITY,
];

export function buildSystemPrompt(agent: 'claude' | 'codex'): string {
  const agentSections =
    agent === 'claude'
      ? [CLAUDE_PLAN_MODE, CLAUDE_TODO_TRACKING]
      : [CODEX_TASK_TRACKING, CODEX_BASH_CONVENTIONS];

  // Agent sections come after identity but before workflow
  const sections = [
    SHARED_SECTIONS[0], // IDENTITY
    ...agentSections,
    ...SHARED_SECTIONS.slice(1),
  ];

  return sections.join('\n\n');
}
