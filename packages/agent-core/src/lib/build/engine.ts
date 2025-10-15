import { createUIMessageStream, type UIMessageStreamWriter } from 'ai';
import { db } from '@/lib/db/client';
import { projects, messages } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { join } from 'path';
import { readFile } from 'fs/promises';
import type { Template } from '@/lib/templates/config';
import { getTemplateById, selectTemplateFromPrompt } from '@/lib/templates/config';
import { downloadTemplate, getProjectFileTree } from '@/lib/templates/downloader';
import type { BuildRequest } from '@/types/build';
import {
  reservePortForProject,
  releasePortForProject,
  updatePortReservationForProject,
  buildEnvForFramework,
  getRunCommand,
  withEnforcedPort,
} from '@/lib/port-allocator';
import { getWorkspaceRoot } from '@/lib/workspace';

export interface AgentMessage {
  type: string;
  subtype?: string;
  message?: {
    id?: string;
    content?: Array<{
      type: string;
      text?: string;
      id?: string;
      name?: string;
      input?: unknown;
      tool_use_id?: string;
      content?: string;
    }>;
  };
  uuid?: string;
  error?: unknown;
  result?: unknown;
  usage?: unknown;
  finalResponse?: unknown;
}

export type AgentQueryFn = (args: {
  prompt: string;
  inputMessages: Array<{ role: string; content: string }>;
  options: Record<string, unknown>;
}) => AsyncGenerator<AgentMessage> | Promise<AsyncGenerator<AgentMessage>>;

export interface BuildStreamOptions extends BuildRequest {
  projectId: string;
  query: AgentQueryFn;
}

interface ProjectMetadata {
  slug: string;
  friendlyName: string;
  description: string;
  icon: string;
  template: string;
}

interface RuntimeMetadata {
  runCommand: string;
  projectType: string;
  port: number;
}

function resolveScriptRunner(packageJson: any): 'npm' | 'pnpm' | 'yarn' | 'bun' {
  const pm = typeof packageJson?.packageManager === 'string'
    ? packageJson.packageManager.toLowerCase()
    : '';

  if (pm.startsWith('pnpm')) return 'pnpm';
  if (pm.startsWith('yarn')) return 'yarn';
  if (pm.startsWith('bun')) return 'bun';

  if (packageJson?.devDependencies?.pnpm) return 'pnpm';
  if (packageJson?.devDependencies?.yarn) return 'yarn';
  if (packageJson?.devDependencies?.bun) return 'bun';

  return 'npm';
}

function buildScriptCommand(runner: 'npm' | 'pnpm' | 'yarn' | 'bun', script: string): string {
  switch (runner) {
    case 'pnpm':
      return `pnpm ${script}`;
    case 'yarn':
      return `yarn ${script}`;
    case 'bun':
      return script === 'dev' ? 'bun dev' : `bun run ${script}`;
    default:
      return `npm run ${script}`;
  }
}

async function detectRuntimeMetadata(projectPath: string): Promise<RuntimeMetadata | null> {
  try {
    const packageJsonPath = join(projectPath, 'package.json');
    const raw = await readFile(packageJsonPath, 'utf-8');
    const packageJson = JSON.parse(raw);

    const runner = resolveScriptRunner(packageJson);
    const scripts = packageJson.scripts ?? {};

    let runCommand = '';
    if (scripts.dev) {
      runCommand = buildScriptCommand(runner, 'dev');
    } else if (scripts.start) {
      runCommand = buildScriptCommand(runner, 'start');
    }

    if (!runCommand) {
      runCommand = runner === 'yarn' ? 'yarn dev'
        : runner === 'pnpm' ? 'pnpm dev'
        : runner === 'bun' ? 'bun dev'
        : 'npm run dev';
    }

    let projectType = 'unknown';
    let port = 3000;

    const deps = packageJson.dependencies ?? {};
    const devDeps = packageJson.devDependencies ?? {};

    if (deps.next || devDeps.next) {
      projectType = 'next';
      port = 3001;
    } else if (deps.astro || devDeps.astro) {
      projectType = 'astro';
      port = 4321;
    } else if (deps['@angular/core'] || devDeps['@angular/core']) {
      projectType = 'angular';
      port = 4200;
    } else if (devDeps.vite && !deps.astro && !devDeps.astro) {
      projectType = 'vite';
      port = 5173;
    }

    return {
      runCommand,
      projectType,
      port,
    };
  } catch (error) {
    console.warn('⚠️  Could not detect runtime metadata:', error);
    return null;
  }
}

export async function createBuildStream(options: BuildStreamOptions) {
  const { projectId: id, prompt, operationType, context, query } = options;

  const stream = createUIMessageStream({
    async execute({ writer }) {
      await runBuildPipeline({ projectId: id, prompt, operationType, context, writer, query });
    },
  });

  return stream;
}

function serializeMessageContent(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }
  try {
    return JSON.stringify(content);
  } catch (error) {
    console.error('Failed to serialize message content, falling back to string', error);
    return JSON.stringify({ type: 'text', text: String(content) });
  }
}

interface BuildPipelineParams extends BuildRequest {
  projectId: string;
  writer: UIMessageStreamWriter;
  query: AgentQueryFn;
}

async function runBuildPipeline(params: BuildPipelineParams) {
  const { projectId: id, prompt, operationType, context, writer, query } = params;

  const project = await db.select().from(projects).where(eq(projects.id, id)).limit(1);

  if (project.length === 0) {
    throw new Error('Project not found');
  }

  await db.update(projects)
    .set({ status: 'in_progress', lastActivityAt: new Date() })
    .where(eq(projects.id, id));

  await db.insert(messages).values({
    projectId: id,
    role: 'user',
    content: serializeMessageContent([{ type: 'text', text: prompt }]),
  });

  console.log('🎯 Starting build execution...');

  const workspaceRoot = getWorkspaceRoot();
  const projectsDir = workspaceRoot;
  const projectName = project[0].slug;
  const projectPath = project[0].path;

  let systemPrompt = '';
  let selectedTemplate: Template | null = null;
  let fileTree = '';
  let maxTurns = 100;
  let metadata: ProjectMetadata | null = null;

  const projectsDirName = workspaceRoot;

  switch (operationType) {
    case 'initial-build': {
      console.log('🆕 INITIAL BUILD - Starting pre-build phase...');
      writer.write({ type: 'pre-build-start' } as any);

      metadata = await extractProjectMetadata(prompt, query);
      writer.write({
        type: 'metadata-extracted',
        metadata,
      } as any);

      selectedTemplate = metadata?.template
        ? await getTemplateById(metadata.template)
        : await selectTemplateFromPrompt(prompt);

      if (!selectedTemplate) {
        throw new Error('Unable to resolve template for build');
      }

      writer.write({ type: 'template-selected', template: selectedTemplate } as any);

      const downloadResult = await downloadTemplate(selectedTemplate, projectName);
      writer.write({ type: 'template-downloaded', path: downloadResult } as any);

      fileTree = await getProjectFileTree(downloadResult);
      systemPrompt = await buildInitialSystemPrompt({
        selectedTemplate,
        fileTree,
        projectPath,
        prompt,
        projectsDir: projectsDirName,
        projectName,
      });

      break;
    }

    case 'enhancement': {
      console.log('🔧 ENHANCEMENT - Follow-up chat for existing project');
      fileTree = await getProjectFileTree(projectPath);

      if (project[0].projectType) {
        const templateIdMap: Record<string, string> = {
          vite: 'react-vite',
          next: 'nextjs-fullstack',
          astro: 'astro-static',
        };
        const templateId = templateIdMap[project[0].projectType] || 'react-vite';
        selectedTemplate = await getTemplateById(templateId);
      }

      systemPrompt = buildEnhancementPrompt({
        project: project[0],
        fileTree,
        prompt,
        projectsDir: projectsDirName,
        projectName,
        selectedTemplate,
      });
      break;
    }

    case 'focused-edit': {
      console.log('🎯 FOCUSED EDIT - Targeted element change');
      maxTurns = 15;
      fileTree = await getProjectFileTree(projectPath);
      systemPrompt = buildFocusedEditPrompt({
        project: project[0],
        fileTree,
        prompt,
        context,
        projectsDir: projectsDirName,
        projectName,
      });
      break;
    }

    case 'continuation': {
      console.log('🔁 CONTINUATION - Retrying failed build');
      fileTree = await getProjectFileTree(projectPath);
      systemPrompt = buildContinuationPrompt({
        project: project[0],
        fileTree,
        prompt,
        projectsDir: projectsDirName,
        projectName,
        selectedTemplate,
      });
      break;
    }
  }

  const fullPrompt = operationType === 'focused-edit' && context?.elementSelector
    ? `${prompt}\n\nTarget element: ${context.elementSelector}`
    : prompt;

  const agentStream = (await query({
    prompt: fullPrompt,
    inputMessages: [{ role: 'system', content: systemPrompt }],
    options: {
      model: 'claude-sonnet-4-5',
      cwd: projectsDir,
      permissionMode: 'bypassPermissions',
      maxTurns,
      systemPrompt,
    },
  })) as AsyncGenerator<AgentMessage>;

  await writeAgentMessagesToStream(agentStream, writer, id);

  const projectUpdates: Record<string, unknown> = {
    status: 'completed',
    lastActivityAt: new Date(),
  };

  const runtimeMetadata = await detectRuntimeMetadata(projectPath);
  if (runtimeMetadata) {
    console.log('🛠️  Runtime metadata detected:', runtimeMetadata);
    Object.assign(projectUpdates, runtimeMetadata);
  } else {
    console.warn('⚠️  Unable to determine runtime metadata for project, using defaults');
  }

  await db.update(projects)
    .set(projectUpdates)
    .where(eq(projects.id, id));

  if (operationType === 'initial-build') {
    await autoStartDevServer(id);
  }
}

async function extractProjectMetadata(prompt: string, query: AgentQueryFn): Promise<ProjectMetadata> {
  console.log('🤖 Extracting project metadata...');

  const metadataStream = await query({
    prompt: `Analyze this project request: "${prompt}"\n\nExtract metadata and select the best template.\n\nAvailable templates:\n- react-vite: React with Vite, TypeScript, Tailwind (fast SPA, client-side only)\n- nextjs-fullstack: Next.js with TypeScript, Tailwind (SSR, API routes, full-stack)\n- astro-static: Astro with TypeScript, Tailwind (static site generation, content-focused)\n\nOutput ONLY valid JSON (no markdown, no explanation):\n{\n  "slug": "short-kebab-case-name",\n  "friendlyName": "Friendly Display Name",\n  "description": "Brief description of what this builds",\n  "icon": "Package",\n  "template": "react-vite"\n}\n\nAvailable icons: Package, Rocket, Code, Zap, Database, Globe, ShoppingCart, Calendar, MessageSquare, Mail, FileText, Image, Music, Video, Book, Heart, Star, Users, Settings, Layout, Grid, List, Edit, Search, Filter\n\nRules:\n- slug must be lowercase, kebab-case, 2-4 words max\n- friendlyName should be concise (2-5 words)\n- description should explain what the app does\n- template must be one of: react-vite, nextjs-fullstack, astro-static\n\nTemplate Selection Logic (PRIORITY ORDER):\n1. If user explicitly mentions "vite" OR "react vite" → react-vite\n2. If user explicitly mentions "next" OR "nextjs" → nextjs-fullstack\n3. If user explicitly mentions "astro" → astro-static\n4. If user mentions backend needs (API, database, auth, server) → nextjs-fullstack\n5. If user mentions static content (blog, docs, markdown) → astro-static\n6. For simple landing pages with NO backend → react-vite (simpler/faster)\n7. For landing pages WITH backend/forms/API → nextjs-fullstack\n8. For interactive apps (todo, dashboard, calculator, game) → react-vite\n9. Default if unclear → react-vite (simplest option)\n\nCRITICAL: Pay attention to explicit technology mentions. If user says "vite landing page", use react-vite NOT nextjs!`,
    inputMessages: [],
    options: {
      model: 'claude-3-5-haiku-20241022',
      maxTurns: 1,
      systemPrompt: 'You are a metadata extraction assistant. Output ONLY valid JSON. No markdown blocks. No explanations. Just raw JSON.',
    },
  });

  let jsonResponse = '';
  for await (const message of metadataStream as AsyncGenerator<AgentMessage>) {
    if (message.type === 'assistant' && message.message?.content) {
      for (const block of message.message.content) {
        if (block.type === 'text' && block.text) {
          jsonResponse += block.text;
        }
      }
    }
  }

  try {
    let cleanedResponse = jsonResponse.trim();
    cleanedResponse = cleanedResponse.replace(/```json\s*/g, '');
    cleanedResponse = cleanedResponse.replace(/```\s*/g, '');
    cleanedResponse = cleanedResponse.trim();

    const jsonMatch = cleanedResponse.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const metadata = JSON.parse(jsonMatch[0]) as ProjectMetadata;
      if (!metadata.slug || !metadata.friendlyName || !metadata.template) {
        throw new Error('Missing required fields in metadata');
      }
      return metadata;
    }
  } catch (parseError) {
    console.error('❌ JSON parsing failed:', parseError);
  }

  const slug = prompt
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 50)
    .replace(/-$/, '');

  return {
    slug: slug || `project-${Date.now()}`,
    friendlyName: prompt.substring(0, 50),
    description: prompt.substring(0, 150),
    icon: 'Code',
    template: 'react-vite',
  };
}

async function writeAgentMessagesToStream(
  agentStream: AsyncGenerator<AgentMessage>,
  writer: UIMessageStreamWriter,
  projectId: string,
) {
  let currentMessageId: string | null = null;
  let messageStarted = false;
  let currentMessageParts: Array<{ type: string; text?: string; toolCallId?: string; toolName?: string; input?: unknown; output?: unknown }> = [];

  for await (const message of agentStream) {
    if (message.type === 'system' && message.subtype === 'init') {
      continue;
    }

    if (message.type === 'assistant') {
      const content = message.message?.content;
      const assistantMessageId = message.message?.id || message.uuid;

      if (assistantMessageId !== currentMessageId) {
        if (messageStarted && currentMessageId && currentMessageParts.length > 0) {
          await db.insert(messages).values({
            projectId,
            role: 'assistant',
            content: serializeMessageContent(currentMessageParts),
          });
          currentMessageParts = [];
        }

        if (messageStarted && currentMessageId) {
          writer.write({ type: 'finish' });
        }

        currentMessageId = assistantMessageId ?? null;
        messageStarted = true;
        writer.write({ type: 'start', messageId: assistantMessageId });
      }

      if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === 'text' && block.text) {
            const textBlockId = `${assistantMessageId}-text-${Date.now()}`;
            writer.write({ type: 'text-start', id: textBlockId });
            writer.write({ type: 'text-delta', id: textBlockId, delta: block.text });
            writer.write({ type: 'text-end', id: textBlockId });
            currentMessageParts.push({ type: 'text', text: block.text });
          } else if (block.type === 'tool_use' && block.id && block.name) {
            const input = block.input as Record<string, unknown> | undefined;
            const pathToCheck = [
              typeof input?.command === 'string' ? input.command : null,
              typeof input?.file_path === 'string' ? input.file_path : null,
              typeof input?.path === 'string' ? input.path : null,
            ].find((value): value is string => !!value) ?? '';

            if (pathToCheck && (pathToCheck.includes('/Users/') || pathToCheck.includes('/home/'))) {
              console.error('🚨 PATH VIOLATION:', pathToCheck);
            }

            writer.write({
              type: 'tool-input-available',
              toolCallId: block.id,
              toolName: block.name,
              input: block.input,
            });

            currentMessageParts.push({
              type: `tool-${block.name}`,
              toolCallId: block.id,
              toolName: block.name,
              input: block.input,
            });
          }
        }
      }
    } else if (message.type === 'user' && message.message?.content) {
      const content = message.message.content;
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === 'tool_result' && block.tool_use_id) {
            writer.write({
              type: 'tool-output-available',
              toolCallId: block.tool_use_id,
              output: block.content,
            });

            const toolPart = currentMessageParts.find(p => p.toolCallId === block.tool_use_id);
            if (toolPart) {
              toolPart.output = block.content;
            }
          }
        }
      }
    } else if (message.type === 'result') {
      if (messageStarted && currentMessageId && currentMessageParts.length > 0) {
        await db.insert(messages).values({
          projectId,
          role: 'assistant',
          content: serializeMessageContent(currentMessageParts),
        });
      }

      if (messageStarted && currentMessageId) {
        writer.write({ type: 'finish' });
        messageStarted = false;
      }
    } else if (message.type === 'error') {
      console.error('❌ Agent Error:', message.error);
      writer.write({
        type: 'error',
        error: message.error instanceof Error ? message.error.message : String(message.error),
      } as any);
    }
  }
}

async function autoStartDevServer(projectId: string) {
  try {
    const project = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);

    if (project.length === 0) return;
    const proj = project[0];

    if (!proj.runCommand) return;

    const { port: reservedPort, framework } = await reservePortForProject({
      projectId,
      projectType: proj.projectType,
      runCommand: proj.runCommand,
      preferredPort: proj.port || undefined,
    });

    const baseCommand = getRunCommand(proj.runCommand);
    const command = withEnforcedPort(baseCommand, framework, reservedPort);
    const env = buildEnvForFramework(framework, reservedPort);

    const { startDevServer } = await import('@/lib/process-manager');

    const { pid, emitter } = startDevServer({
      projectId,
      command,
      cwd: proj.path,
      env,
    });

    const finalPort = await new Promise<number>((resolve) => {
      const timeout = setTimeout(() => resolve(reservedPort), 8000);
      emitter.once('port', (p: number) => {
        clearTimeout(timeout);
        resolve(p);
      });
    });

    if (finalPort !== reservedPort) {
      await updatePortReservationForProject(projectId, finalPort);
    }

    await db.update(projects)
      .set({
        devServerPid: pid,
        devServerPort: finalPort,
        port: finalPort,
        devServerStatus: 'running',
        lastActivityAt: new Date(),
      })
      .where(eq(projects.id, projectId));

    emitter.once('exit', async ({ code, signal }: { code: number | null; signal: NodeJS.Signals | null }) => {
      await db.update(projects)
        .set({
          devServerPid: null,
          devServerPort: null,
          devServerStatus: code === 0 || signal === 'SIGTERM' || signal === 'SIGINT' ? 'stopped' : 'failed',
        })
        .where(eq(projects.id, projectId));
      await releasePortForProject(projectId);
    });
  } catch (error) {
    console.error('❌ Auto-start failed:', error);
    await releasePortForProject(projectId);
  }
}

async function buildInitialSystemPrompt(params: {
  selectedTemplate: Template;
  fileTree: string;
  projectPath: string;
  prompt: string;
  projectsDir: string;
  projectName: string;
}) {
  const { selectedTemplate, fileTree, projectPath, prompt, projectsDir, projectName } = params;
  const promptAddition = selectedTemplate.ai?.systemPromptAddition || '';
  return `You are a helpful coding assistant specialized in building JavaScript applications.

🎯 INITIAL BUILD - TEMPLATE ALREADY DOWNLOADED

✅ **Template has been automatically selected and downloaded:**

Template: ${selectedTemplate.name}
Location: ${projectPath}
Framework: ${selectedTemplate.tech?.framework}

**Project Structure:**
${fileTree}

${promptAddition}

**Included Features:**
${selectedTemplate.ai?.includedFeatures?.map((f) => `  • ${f}`).join('\n') ?? ''}

**Setup Commands:**
  Install: ${selectedTemplate.setup?.installCommand}
  Dev: ${selectedTemplate.setup?.devCommand}
  Build: ${selectedTemplate.setup?.buildCommand}

**Your Task:**
The template is already downloaded and ready. You need to:
1. Install dependencies
2. Customize the template to match: "${prompt}"
3. Add any additional features requested

DO NOT scaffold a new project - the template is already there!
START by installing dependencies, THEN customize the existing code.

${getSharedPromptSections(projectsDir, projectName, selectedTemplate)}`;
}

function buildEnhancementPrompt(params: {
  project: typeof projects.$inferSelect;
  fileTree: string;
  prompt: string;
  projectsDir: string;
  projectName: string;
  selectedTemplate: Template | null;
}) {
  const { project, fileTree, prompt, projectsDir, projectName, selectedTemplate } = params;
  return `You are enhancing an existing project with new features or changes.

🔄 ENHANCEMENT MODE

**Project:** ${project.name}
**Location:** ${project.path}
**Type:** ${project.projectType || 'Unknown'}

**Current Structure:**
${fileTree}

**User's Request:**
"${prompt}"

**Your Task:**
1. Review the existing code structure
2. Make the requested changes/additions
3. Update or add files as needed
4. Test if necessary

This is an EXISTING project - modify what's there, don't recreate from scratch!

${getSharedPromptSections(projectsDir, projectName, selectedTemplate)}`;
}

function buildFocusedEditPrompt(params: {
  project: typeof projects.$inferSelect;
  fileTree: string;
  prompt: string;
  context: BuildRequest['context'];
  projectsDir: string;
  projectName: string;
}) {
  const { project, fileTree, prompt, context, projectsDir, projectName } = params;
  return `You are making a focused, surgical change to an existing project.

🎯 FOCUSED EDIT MODE

**Project:** ${project.name}
**Location:** ${project.path}

${context?.elementSelector ? `**Target Element:**
Selector: ${context.elementSelector}
Tag: <${context.elementInfo?.tagName || 'unknown'}>
${context.elementInfo?.className ? `Classes: ${context.elementInfo.className}` : ''}
${context.elementInfo?.textContent ? `Text: "${context.elementInfo.textContent.substring(0, 100)}"` : ''}` : ''}

**Change Request:**
"${prompt}"

**Your Task:**
1. Find the specific element/code to change
2. Make ONLY the requested change
3. Verify it's complete
4. Do NOT make unrelated changes

Be quick and precise - this is a targeted edit!

${getSharedPromptSections(projectsDir, projectName, null)}`;
}

function buildContinuationPrompt(params: {
  project: typeof projects.$inferSelect;
  fileTree: string;
  prompt: string;
  projectsDir: string;
  projectName: string;
  selectedTemplate: Template | null;
}) {
  const { project, fileTree, prompt, projectsDir, projectName, selectedTemplate } = params;
  return `You are continuing a previous build that encountered issues.

🔁 CONTINUATION MODE

**Project:** ${project.name}
**Location:** ${project.path}
**Previous Error:** ${project.errorMessage || 'Unknown error'}

**Current Structure:**
${fileTree}

**Your Task:**
Continue from where you left off. Review what's been done and complete the build.

${getSharedPromptSections(projectsDir, projectName, selectedTemplate)}`;
}

function getSharedPromptSections(projectsDir: string, projectName: string, selectedTemplate: Template | null) {
  return `
🚨 PATH REQUIREMENTS 🚨

Your CWD: ${projectsDir}
Project directory: ${projectName}

PATH RULES:
✅ Use: ${projectName}/file.ts
✅ Use: cd ${projectName} && npm install
❌ NEVER: /Users/anything
❌ NEVER: /home/anything
❌ NEVER: Absolute paths

🎯 TASK MANAGEMENT:

Use TodoWrite to create detailed task breakdowns:
- Mark tasks "in_progress" when starting
- Mark "completed" immediately when done
- Create final summary task: "Project ready - Review and launch"

📄 FILE WRITING:

ALWAYS write COMPLETE file contents. NO placeholders like:
❌ "// ... rest remains same"
❌ "/* keeping existing code */"

✅ Write the ENTIRE file every time.

🔧 TYPESCRIPT:

Use explicit type imports:
✅ import type { MyType } from './types'
❌ import { MyType } from './types'

🌈 TAILWIND CSS v4 CONFIGURATION - CRITICAL 🌈

IMPORTANT: All templates use Tailwind CSS v4, which requires FUNCTION SYNTAX for CSS variables:

✅ CORRECT formats in globals.css or app.css:
  --primary: rgb(117 83 255);
  --background: oklch(0.24 0.05 294);

❌ WRONG formats (Tailwind v3 - DO NOT USE):
  --primary: 117 83 255;
  --primary: #7553FF;

Rules for CSS color variables:
1. Use rgb() or oklch() function syntax
2. Inside function: space-separated values (NO commas)
3. Apply to ALL color variables in :root

Example correct globals.css:
:root {
  --background: rgb(18 12 37);
  --foreground: rgb(255 255 255);
  --primary: rgb(117 83 255);
  --accent: rgb(255 69 168);
}

Both rgb() and oklch() work - but you MUST use function syntax!

📦 DEPENDENCIES:

Add ALL dependencies to package.json FIRST, then install once.

${selectedTemplate ? `
🛠️ WORKFLOW:

The template is already downloaded. Follow this sequence:
1. cd ${projectName} && ${selectedTemplate.setup?.installCommand}
2. Customize existing files to match user's request
3. Add new features as needed
4. Mark final todo as complete
` : ''}

DO NOT manually start/stop servers - the system handles this automatically!
`;
}
