import * as Sentry from '@sentry/nextjs';
import { createUIMessageStream, createUIMessageStreamResponse, type UIMessageStreamWriter } from 'ai';
import { db } from '@/lib/db/client';
import { projects, messages } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { getTemplateById, selectTemplateFromPrompt, getTemplateSelectionContext } from '@/lib/templates/config';
import { downloadTemplate, getProjectFileTree } from '@/lib/templates/downloader';
import type { BuildRequest, BuildOperationType } from '@/types/build';
import {
  reservePortForProject,
  releasePortForProject,
  updatePortReservationForProject,
  buildEnvForFramework,
  getRunCommand,
} from '@/lib/port-allocator';
import {
  cloneWebpage,
  detectUrlInPrompt,
  isValidUrl,
  mapTechStackToTemplate,
  convertHtmlToReact,
  type ClonedWebpage
} from '@/lib/webpage-cloner';

const query = Sentry.createInstrumentedClaudeQuery();

export const maxDuration = 30;

interface AgentMessage {
  type: string;
  subtype?: string;
  message?: {
    id?: string;
    content?: Array<{ type: string; text?: string; id?: string; name?: string; input?: unknown; tool_use_id?: string; content?: string }>;
  };
  uuid?: string;
  error?: unknown;
}

/**
 * Improved Haiku metadata extraction with template selection
 */
async function extractProjectMetadata(prompt: string) {
  console.log('🤖 Extracting project metadata with Haiku...');

  const metadataStream = query({
    prompt: `Analyze this project request: "${prompt}"

Extract metadata and select the best template.

Available templates:
- react-vite: React with Vite, TypeScript, Tailwind (fast SPA, client-side only)
- nextjs-fullstack: Next.js with TypeScript, Tailwind (SSR, API routes, full-stack)
- astro-static: Astro with TypeScript, Tailwind (static site generation, content-focused)

Output ONLY valid JSON (no markdown, no explanation):
{
  "slug": "short-kebab-case-name",
  "friendlyName": "Friendly Display Name",
  "description": "Brief description of what this builds",
  "icon": "Package",
  "template": "react-vite"
}

Available icons: Package, Rocket, Code, Zap, Database, Globe, ShoppingCart, Calendar, MessageSquare, Mail, FileText, Image, Music, Video, Book, Heart, Star, Users, Settings, Layout, Grid, List, Edit, Search, Filter

Rules:
- slug must be lowercase, kebab-case, 2-4 words max
- friendlyName should be concise (2-5 words)
- description should explain what the app does
- template must be one of: react-vite, nextjs-fullstack, astro-static

Template Selection Logic (PRIORITY ORDER):
1. If user explicitly mentions "vite" OR "react vite" → react-vite
2. If user explicitly mentions "next" OR "nextjs" → nextjs-fullstack
3. If user explicitly mentions "astro" → astro-static
4. If user mentions backend needs (API, database, auth, server) → nextjs-fullstack
5. If user mentions static content (blog, docs, markdown) → astro-static
6. For simple landing pages with NO backend → react-vite (simpler/faster)
7. For landing pages WITH backend/forms/API → nextjs-fullstack
8. For interactive apps (todo, dashboard, calculator, game) → react-vite
9. Default if unclear → react-vite (simplest option)

CRITICAL: Pay attention to explicit technology mentions. If user says "vite landing page", use react-vite NOT nextjs!`,
    inputMessages: [],
    options: {
      model: 'claude-3-5-haiku-20241022',
      maxTurns: 1,
      systemPrompt: 'You are a metadata extraction assistant. Output ONLY valid JSON. No markdown blocks. No explanations. Just raw JSON.',
    },
  });

  // Parse response
  let jsonResponse = '';
  for await (const message of metadataStream) {
    const msg = message as AgentMessage;
    if (msg.type === 'assistant' && msg.message?.content) {
      for (const block of msg.message.content) {
        if (block.type === 'text' && block.text) {
          jsonResponse += block.text;
        }
      }
    }
  }

  console.log('📥 Raw Haiku response:', jsonResponse);

  // Parse JSON
  try {
    let cleanedResponse = jsonResponse.trim();
    cleanedResponse = cleanedResponse.replace(/```json\s*/g, '');
    cleanedResponse = cleanedResponse.replace(/```\s*/g, '');
    cleanedResponse = cleanedResponse.trim();

    const jsonMatch = cleanedResponse.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const metadata = JSON.parse(jsonMatch[0]);

      // Validate required fields
      if (!metadata.slug || !metadata.friendlyName || !metadata.template) {
        throw new Error('Missing required fields in metadata');
      }

      console.log('✅ Parsed metadata:', metadata);
      return metadata;
    }
  } catch (parseError) {
    console.error('❌ JSON parsing failed:', parseError);
  }

  // Fallback
  console.log('🔄 Using fallback metadata generation...');
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
    template: 'react-vite', // Safe default
  };
}

/**
 * Stream agent messages to UI
 */
async function writeAgentMessagesToStream(
  agentStream: AsyncGenerator<AgentMessage>,
  writer: UIMessageStreamWriter,
  projectId: string,
  expectedCwd: string,
  projectName: string
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
        // Save previous message to DB
        if (messageStarted && currentMessageId && currentMessageParts.length > 0) {
          await db.insert(messages).values({
            projectId,
            role: 'assistant',
            content: currentMessageParts,
          });
          currentMessageParts = [];
        }

        if (messageStarted && currentMessageId) {
          writer.write({ type: 'finish' });
        }

        currentMessageId = assistantMessageId ?? null;
        messageStarted = true;
        writer.write({
          type: 'start',
          messageId: assistantMessageId,
        });
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
            // Path violation detection
            if (block.name === 'Bash' || block.name === 'Read' || block.name === 'Write' || block.name === 'Edit') {
              const input = block.input as any;
              const pathToCheck = input?.command || input?.file_path || input?.path || '';

              if (typeof pathToCheck === 'string' && (pathToCheck.includes('/Users/') || pathToCheck.includes('/home/'))) {
                console.error('🚨 PATH VIOLATION:', pathToCheck);
              }
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
      // Save final message to DB
      if (messageStarted && currentMessageId && currentMessageParts.length > 0) {
        await db.insert(messages).values({
          projectId,
          role: 'assistant',
          content: currentMessageParts,
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
        errorText: typeof message.error === 'string' ? message.error : JSON.stringify(message.error),
      });

      await db.update(projects)
        .set({
          status: 'failed',
          errorMessage: typeof message.error === 'string' ? message.error : JSON.stringify(message.error),
        })
        .where(eq(projects.id, projectId));
    }
  }

  if (messageStarted && currentMessageId) {
    writer.write({ type: 'finish' });
  }
}

/**
 * Unified build endpoint
 * Handles all build operations with proper routing
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  console.log('🏗️  Build request received for project:', id);

  try {
    const body: BuildRequest = await req.json();
    const { operationType, prompt, context } = body;

    console.log('   Operation type:', operationType);
    console.log('   Prompt:', prompt.substring(0, 100));

    // Validate
    if (!prompt || typeof prompt !== 'string') {
      return new Response(JSON.stringify({ error: 'Prompt is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Get project
    const project = await db.select().from(projects).where(eq(projects.id, id)).limit(1);

    if (project.length === 0) {
      return new Response(JSON.stringify({ error: 'Project not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Update status
    await db.update(projects)
      .set({ status: 'in_progress', lastActivityAt: new Date() })
      .where(eq(projects.id, id));

    // Save user message to DB
    await db.insert(messages).values({
      projectId: id,
      role: 'user',
      content: [{ type: 'text', text: prompt }],
    });

    const stream = createUIMessageStream({
      async execute({ writer }) {
        console.log('🎯 Starting build execution...');

        try {
          const projectsDir = join(process.cwd(), 'projects');
          const projectName = project[0].slug;
          const projectPath = project[0].path;

          // Check if project directory exists
          const { existsSync } = await import('fs');
          const { readdir } = await import('fs/promises');

          let hasFiles = false;
          try {
            if (existsSync(projectPath)) {
              const files = await readdir(projectPath);
              hasFiles = files.length > 0;
            }
          } catch {
            hasFiles = false;
          }

          // Route based on operation type
          let systemPrompt = '';
          let selectedTemplate: any = null;
          let fileTree = '';
          let maxTurns = 100;

          switch (operationType) {
            case 'initial-build': {
              console.log('🆕 INITIAL BUILD - Starting pre-build phase...');

              // 🌐 DETECT URL FOR WEBPAGE CLONING
              const detectedUrl = detectUrlInPrompt(prompt);
              const isCloneRequest = detectedUrl && isValidUrl(detectedUrl);
              let clonedWebpage: ClonedWebpage | null = null;

              if (isCloneRequest) {
                console.log('🌐 WEBPAGE CLONING MODE DETECTED');
                console.log(`   URL: ${detectedUrl}`);

                // Show cloning UI
                writer.write({
                  type: 'data-reasoning' as any,
                  data: { message: `Cloning webpage from ${detectedUrl}...` },
                });

                writer.write({
                  type: 'tool-input-available',
                  toolCallId: 'clone-1',
                  toolName: 'TodoWrite',
                  input: {
                    todos: [
                      { content: `Clone webpage: ${detectedUrl}`, status: 'in_progress', activeForm: 'Cloning webpage' },
                      { content: 'Analyze tech stack', status: 'pending', activeForm: 'Analyzing tech stack' },
                      { content: 'Select template', status: 'pending', activeForm: 'Selecting template' },
                      { content: 'Download template', status: 'pending', activeForm: 'Downloading template' },
                      { content: 'Seed with cloned content', status: 'pending', activeForm: 'Seeding template' },
                      { content: 'Install dependencies', status: 'pending', activeForm: 'Installing dependencies' },
                      { content: 'Customize for your needs', status: 'pending', activeForm: 'Customizing project' },
                    ],
                  },
                });

                try {
                  // Clone the webpage
                  clonedWebpage = await cloneWebpage({
                    url: detectedUrl,
                    waitForNetworkIdle: true,
                    captureAssets: true,
                    timeout: 30000,
                  });

                  console.log('✅ Webpage cloned successfully');
                  console.log(`   Tech: ${clonedWebpage.techStack.detectedLibraries.join(', ')}`);

                  writer.write({
                    type: 'tool-input-available',
                    toolCallId: 'clone-2',
                    toolName: 'TodoWrite',
                    input: {
                      todos: [
                        { content: `Cloned: ${clonedWebpage.metadata.title || detectedUrl}`, status: 'completed', activeForm: 'Cloning webpage' },
                        { content: `Tech: ${clonedWebpage.techStack.detectedLibraries.join(', ') || 'Plain HTML'}`, status: 'completed', activeForm: 'Analyzing tech stack' },
                        { content: 'Select template', status: 'in_progress', activeForm: 'Selecting template' },
                        { content: 'Download template', status: 'pending', activeForm: 'Downloading template' },
                        { content: 'Seed with cloned content', status: 'pending', activeForm: 'Seeding template' },
                        { content: 'Install dependencies', status: 'pending', activeForm: 'Installing dependencies' },
                        { content: 'Customize for your needs', status: 'pending', activeForm: 'Customizing project' },
                      ],
                    },
                  });
                } catch (cloneError) {
                  console.error('❌ Failed to clone webpage:', cloneError);
                  writer.write({
                    type: 'error',
                    errorText: `Failed to clone webpage: ${cloneError instanceof Error ? cloneError.message : 'Unknown error'}`,
                  });
                  clonedWebpage = null;
                }
              }

              // Send pre-build start event
              if (!isCloneRequest) {
                writer.write({
                  type: 'data-reasoning' as any,
                  data: { message: 'Analyzing your request and preparing build environment...' },
                });

                // STEP 1: Extract metadata (including template selection)
                writer.write({
                  type: 'tool-input-available',
                  toolCallId: 'pre-build-1',
                  toolName: 'TodoWrite',
                  input: {
                    todos: [
                      { content: 'Analyzing request and selecting template', status: 'in_progress', activeForm: 'Analyzing request' },
                      { content: 'Download and setup template', status: 'pending', activeForm: 'Downloading template' },
                      { content: 'Install dependencies', status: 'pending', activeForm: 'Installing dependencies' },
                      { content: 'Customize for your needs', status: 'pending', activeForm: 'Customizing project' },
                    ],
                  },
                });
              }

              // STEP 1: Select template (either from cloned tech or Haiku)
              let metadata: any;

              if (clonedWebpage) {
                // Use tech stack to determine template
                const templateId = mapTechStackToTemplate(clonedWebpage.techStack);
                metadata = {
                  slug: project[0].slug,
                  friendlyName: clonedWebpage.metadata.title || project[0].name,
                  description: clonedWebpage.metadata.description || `Cloned from ${detectedUrl}`,
                  icon: 'Globe',
                  template: templateId,
                };
                console.log('✅ Using cloned webpage metadata:', metadata);
              } else {
                metadata = await extractProjectMetadata(prompt);
              }

              writer.write({
                type: 'data-metadata-extracted' as any,
                data: { metadata },
              });

              writer.write({
                type: 'data-reasoning' as any,
                data: { message: `Creating "${metadata.friendlyName}" using ${metadata.template} template...` },
              });

              // STEP 2: Load and download template
              const { getTemplateById } = await import('@/lib/templates/config');
              selectedTemplate = await getTemplateById(metadata.template);

              if (!selectedTemplate) {
                throw new Error(`Template ${metadata.template} not found`);
              }

              writer.write({
                type: 'data-template-selected' as any,
                data: { template: selectedTemplate },
              });

              // Update todo: analysis complete, downloading
              writer.write({
                type: 'tool-input-available',
                toolCallId: 'pre-build-2',
                toolName: 'TodoWrite',
                input: {
                  todos: [
                    { content: `Selected: ${selectedTemplate.name}`, status: 'completed', activeForm: 'Analyzing request' },
                    { content: `Downloading template: ${selectedTemplate.repository}`, status: 'in_progress', activeForm: 'Downloading template' },
                    { content: 'Install dependencies', status: 'pending', activeForm: 'Installing dependencies' },
                    { content: 'Customize for your needs', status: 'pending', activeForm: 'Customizing project' },
                  ],
                },
              });

              writer.write({
                type: 'data-reasoning' as any,
                data: { message: `Downloading template from GitHub: ${selectedTemplate.repository}...` },
              });

              const downloadedPath = await downloadTemplate(selectedTemplate, projectName);

              // Update project with template info
              await db.update(projects)
                .set({
                  path: downloadedPath,
                  projectType: selectedTemplate.tech.framework,
                  runCommand: selectedTemplate.setup.devCommand,
                  port: selectedTemplate.setup.defaultPort,
                })
                .where(eq(projects.id, id));

              writer.write({
                type: 'data-template-downloaded' as any,
                data: { path: downloadedPath },
              });

              // Update todo: download complete (skip if cloning - use different todos)
              if (!clonedWebpage) {
                writer.write({
                  type: 'tool-input-available',
                  toolCallId: 'pre-build-3',
                  toolName: 'TodoWrite',
                  input: {
                    todos: [
                      { content: `Selected: ${selectedTemplate.name}`, status: 'completed', activeForm: 'Analyzing request' },
                      { content: `Downloaded to: projects/${projectName}`, status: 'completed', activeForm: 'Downloading template' },
                      { content: 'Install dependencies', status: 'pending', activeForm: 'Installing dependencies' },
                      { content: 'Customize for your needs', status: 'pending', activeForm: 'Customizing project' },
                    ],
                  },
                });
              } else {
                // Update cloning todos
                writer.write({
                  type: 'tool-input-available',
                  toolCallId: 'clone-3',
                  toolName: 'TodoWrite',
                  input: {
                    todos: [
                      { content: `Cloned: ${clonedWebpage.metadata.title || detectedUrl}`, status: 'completed', activeForm: 'Cloning webpage' },
                      { content: `Tech: ${clonedWebpage.techStack.detectedLibraries.join(', ') || 'Plain HTML'}`, status: 'completed', activeForm: 'Analyzing tech stack' },
                      { content: `Selected: ${selectedTemplate.name}`, status: 'completed', activeForm: 'Selecting template' },
                      { content: `Downloaded to: projects/${projectName}`, status: 'completed', activeForm: 'Downloading template' },
                      { content: 'Seed with cloned content', status: 'in_progress', activeForm: 'Seeding template' },
                      { content: 'Install dependencies', status: 'pending', activeForm: 'Installing dependencies' },
                      { content: 'Customize for your needs', status: 'pending', activeForm: 'Customizing project' },
                    ],
                  },
                });
              }

              // 🌐 SEED TEMPLATE WITH CLONED CONTENT
              if (clonedWebpage) {
                console.log('🌱 Seeding template with cloned content...');

                try {
                  const { writeFile } = await import('fs/promises');

                  // Convert HTML to React
                  const { appTsx, appCss } = convertHtmlToReact(clonedWebpage, projectName);

                  // Write App.tsx
                  const appTsxPath = join(downloadedPath, 'src', 'App.tsx');
                  await writeFile(appTsxPath, appTsx, 'utf-8');
                  console.log('   ✅ Written App.tsx with cloned content');

                  // Write App.css
                  const appCssPath = join(downloadedPath, 'src', 'App.css');
                  await writeFile(appCssPath, appCss, 'utf-8');
                  console.log('   ✅ Written App.css with cloned styles');

                  console.log('✅ Template seeded successfully');

                  // Update todo: seeding complete
                  writer.write({
                    type: 'tool-input-available',
                    toolCallId: 'clone-4',
                    toolName: 'TodoWrite',
                    input: {
                      todos: [
                        { content: `Cloned: ${clonedWebpage.metadata.title || detectedUrl}`, status: 'completed', activeForm: 'Cloning webpage' },
                        { content: `Tech: ${clonedWebpage.techStack.detectedLibraries.join(', ') || 'Plain HTML'}`, status: 'completed', activeForm: 'Analyzing tech stack' },
                        { content: `Selected: ${selectedTemplate.name}`, status: 'completed', activeForm: 'Selecting template' },
                        { content: `Downloaded to: projects/${projectName}`, status: 'completed', activeForm: 'Downloading template' },
                        { content: 'Seeded with cloned content', status: 'completed', activeForm: 'Seeding template' },
                        { content: 'Install dependencies', status: 'pending', activeForm: 'Installing dependencies' },
                        { content: 'Customize for your needs', status: 'pending', activeForm: 'Customizing project' },
                      ],
                    },
                  });

                  writer.write({
                    type: 'data-reasoning' as any,
                    data: { message: 'Cloned content converted to React and seeded into template.' },
                  });

                } catch (seedError) {
                  console.error('❌ Failed to seed template:', seedError);
                  writer.write({
                    type: 'error',
                    errorText: `Failed to seed template: ${seedError instanceof Error ? seedError.message : 'Unknown error'}`,
                  });
                }
              }

              fileTree = await getProjectFileTree(downloadedPath);

              systemPrompt = `You are a helpful coding assistant specialized in building JavaScript applications.

🎯 INITIAL BUILD - TEMPLATE ALREADY DOWNLOADED${clonedWebpage ? ' + WEBPAGE CLONED' : ''}

✅ **Template has been automatically selected and downloaded:**

Template: ${selectedTemplate.name}
Location: ${projectPath}
Framework: ${selectedTemplate.tech.framework}

${clonedWebpage ? `
🌐 **WEBPAGE CLONING MODE**

A webpage has been cloned and converted to React:
- Original URL: ${clonedWebpage.originalUrl}
- Page Title: ${clonedWebpage.metadata.title}
- Detected Tech: ${clonedWebpage.techStack.detectedLibraries.join(', ') || 'Plain HTML'}
- Framework Selected: ${selectedTemplate.name}

**Cloned Content:**
The webpage's HTML has been converted to React and placed in:
- src/App.tsx (main component with cloned HTML structure)
- src/App.css (all extracted styles from the original page)

**Your Task:**
The template has been seeded with the cloned webpage content. You need to:
1. Install dependencies
2. Review the cloned HTML/CSS in App.tsx and App.css
3. Refine and improve the code structure
4. Break large components into smaller, reusable ones if needed
5. Fix any conversion issues (event handlers, dynamic content, etc.)
6. Apply any customizations the user requested
7. Ensure all styles are working correctly

IMPORTANT:
- The cloned content is already in src/App.tsx - do NOT overwrite it unless improving it
- The HTML has been converted to JSX (className, style objects, etc.)
- Review the code and refactor it into clean, maintainable React components
- Some dynamic functionality may need to be reimplemented in React
- Focus on making the cloned page functional and editable

` : ''}

**Project Structure:**
${fileTree}

${selectedTemplate.ai.systemPromptAddition}

**Included Features:**
${selectedTemplate.ai.includedFeatures.map((f: string) => `  • ${f}`).join('\n')}

**Setup Commands:**
  Install: ${selectedTemplate.setup.installCommand}
  Dev: ${selectedTemplate.setup.devCommand}
  Build: ${selectedTemplate.setup.buildCommand}

**Your Task:**
The template is already downloaded and ready. You need to:
1. Install dependencies
2. ${clonedWebpage ? 'Review and refine the cloned webpage code' : 'Customize the template to match: "' + prompt + '"'}
3. Add any additional features requested

DO NOT scaffold a new project - the template is already there!
START by installing dependencies, THEN ${clonedWebpage ? 'refine the cloned content' : 'customize the existing code'}.

🎯 TASK MANAGEMENT:
- Use TodoWrite to create detailed task breakdown
- Update status as you complete each task
- The initial setup todos will be replaced by your detailed breakdown

${getSharedPromptSections(projectsDir, projectName, selectedTemplate)}`;
              break;
            }

            case 'enhancement': {
              console.log('🔄 ENHANCEMENT - Follow-up chat for existing project');

              fileTree = await getProjectFileTree(projectPath);

              // Load template context if available
              if (project[0].projectType) {
                const templateIdMap: Record<string, string> = {
                  'vite': 'react-vite',
                  'next': 'nextjs-fullstack',
                  'astro': 'astro-static',
                };
                const templateId = templateIdMap[project[0].projectType] || 'react-vite';
                selectedTemplate = await getTemplateById(templateId);
              }

              systemPrompt = `You are enhancing an existing project with new features or changes.

🔄 ENHANCEMENT MODE

**Project:** ${project[0].name}
**Location:** ${projectPath}
**Type:** ${project[0].projectType || 'Unknown'}

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
              break;
            }

            case 'focused-edit': {
              console.log('🎯 FOCUSED EDIT - Targeted element change');

              maxTurns = 15; // Limited for speed
              fileTree = await getProjectFileTree(projectPath);

              systemPrompt = `You are making a focused, surgical change to an existing project.

🎯 FOCUSED EDIT MODE

**Project:** ${project[0].name}
**Location:** ${projectPath}

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
              break;
            }

            case 'continuation': {
              console.log('🔁 CONTINUATION - Retrying failed build');

              fileTree = await getProjectFileTree(projectPath);

              systemPrompt = `You are continuing a previous build that encountered issues.

🔁 CONTINUATION MODE

**Project:** ${project[0].name}
**Location:** ${projectPath}
**Previous Error:** ${project[0].errorMessage || 'Unknown error'}

**Current Structure:**
${fileTree}

**Your Task:**
Continue from where you left off. Review what's been done and complete the build.

${getSharedPromptSections(projectsDir, projectName, selectedTemplate)}`;
              break;
            }
          }

          // Run Claude Code Agent
          const fullPrompt = operationType === 'focused-edit' && context?.elementSelector
            ? `${prompt}\n\nTarget element: ${context.elementSelector}`
            : prompt;

          const agentStream = query({
            prompt: fullPrompt,
            inputMessages: [{ role: 'system', content: systemPrompt }],
            options: {
              model: 'claude-sonnet-4-5',
              cwd: projectsDir,
              permissionMode: 'bypassPermissions',
              maxTurns,
              systemPrompt,
            },
          }) as AsyncGenerator<AgentMessage>;

          await writeAgentMessagesToStream(agentStream, writer, id, projectsDir, projectName);

          // Mark as completed
          await db.update(projects)
            .set({ status: 'completed', lastActivityAt: new Date() })
            .where(eq(projects.id, id));

          // Auto-start server for initial builds
          if (operationType === 'initial-build') {
            await autoStartDevServer(id, projectPath);
          }

        } catch (innerError) {
          console.error('❌ Build error:', innerError);
          await db.update(projects)
            .set({
              status: 'failed',
              errorMessage: innerError instanceof Error ? innerError.message : 'Unknown error',
            })
            .where(eq(projects.id, id));
          throw innerError;
        }
      },
    });

    return createUIMessageStreamResponse({ stream });
  } catch (error) {
    console.error('❌ Build request failed:', error);
    return new Response(JSON.stringify({ error: 'Build failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

/**
 * Auto-start dev server after initial build
 */
async function autoStartDevServer(projectId: string, projectPath: string) {
  try {
    console.log('🚀 Auto-starting dev server...');

    // Detect project metadata from package.json
    const packageJsonPath = join(projectPath, 'package.json');
    const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf-8'));

    let runCommand = 'npm run dev';
    let projectType = 'unknown';
    let port = 3000;

    if (packageJson.dependencies?.next || packageJson.devDependencies?.next) {
      projectType = 'next';
      port = 3001;
    } else if (packageJson.dependencies?.astro || packageJson.devDependencies?.astro) {
      projectType = 'astro';
      port = 4321;
    } else if (packageJson.devDependencies?.vite) {
      projectType = 'vite';
      port = 5173;
    }

    await db.update(projects).set({ runCommand, projectType, port }).where(eq(projects.id, projectId));

    // Start the server
    await new Promise(resolve => setTimeout(resolve, 3000));

    const { startDevServer } = await import('@/lib/process-manager');

    const freshProject = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);

    if (freshProject[0]?.runCommand) {
      const proj = freshProject[0];

      const { port: reservedPort, framework } = await reservePortForProject({
        projectId,
        projectType: proj.projectType,
        runCommand: proj.runCommand,
        preferredPort: proj.port || undefined,
      });

      await db.update(projects)
        .set({
          devServerStatus: 'starting',
          devServerPort: reservedPort,
          lastActivityAt: new Date(),
        })
        .where(eq(projects.id, projectId));

      const command = getRunCommand(proj.runCommand || 'npm run dev');
      const env = buildEnvForFramework(framework, reservedPort);

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

      console.log('✅ Server auto-started:', { pid, port: finalPort });

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
    }
  } catch (error) {
    console.error('❌ Auto-start failed:', error);
    await releasePortForProject(projectId);
  }
}

/**
 * Shared system prompt sections
 */
function getSharedPromptSections(projectsDir: string, projectName: string, selectedTemplate: any) {
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
1. cd ${projectName} && ${selectedTemplate.setup.installCommand}
2. Customize existing files to match user's request
3. Add new features as needed
4. Mark final todo as complete
` : ''}

DO NOT manually start/stop servers - the system handles this automatically!
`;
}
