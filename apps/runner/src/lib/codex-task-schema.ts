/**
 * Zod Schema for Codex Task Planning
 *
 * Used with structured output to guarantee valid task list format.
 */

import { z } from 'zod';
import zodToJsonSchema from 'zod-to-json-schema';

/**
 * Todo item schema matching our TodoItem type
 */
export const TodoItemSchema = z.object({
  content: z.string().describe('What needs to be done (e.g., "Create hero section")'),
  activeForm: z.string().describe('Present continuous form (e.g., "Creating hero section")'),
  status: z.enum(['pending', 'in_progress', 'completed']).describe('Current status of the task'),
});

/**
 * Task plan schema for Codex structured output
 */
export const TaskPlanSchema = z.object({
  analysis: z.string().describe('Brief analysis of what needs to be built (2-3 sentences)'),
  todos: z.array(TodoItemSchema).min(3).max(10).describe('List of tasks to complete the build'),
});

/**
 * Get JSON schema for OpenAI structured output
 *
 * Manually defined to ensure compatibility with Codex requirements.
 * The root MUST be type: "object".
 */
export function getTaskPlanJsonSchema() {
  return {
    type: "object" as const,
    properties: {
      analysis: {
        type: "string" as const,
        description: "Brief analysis of what needs to be built (2-3 sentences)",
      },
      todos: {
        type: "array" as const,
        description: "List of tasks to complete the build",
        items: {
          type: "object" as const,
          properties: {
            content: {
              type: "string" as const,
              description: 'What needs to be done (e.g., "Create hero section")',
            },
            activeForm: {
              type: "string" as const,
              description: 'Present continuous form (e.g., "Creating hero section")',
            },
            status: {
              type: "string" as const,
              enum: ["pending", "in_progress", "completed"] as const,
              description: "Current status of the task",
            },
          },
          required: ["content", "activeForm", "status"] as const,
          additionalProperties: false,
        },
        minItems: 3,
        maxItems: 10,
      },
    },
    required: ["analysis", "todos"] as const,
    additionalProperties: false,
  };
}

/**
 * Type for parsed task plan
 */
export type TaskPlan = z.infer<typeof TaskPlanSchema>;
export type TodoItem = z.infer<typeof TodoItemSchema>;
