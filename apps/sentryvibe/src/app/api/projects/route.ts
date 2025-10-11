import { NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { db } from '@/lib/db/client';
import { projects } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

// Note: This route uses Haiku for metadata extraction only (no filesystem access)
// cwd is set to process.cwd() since we don't need workspace access here
const query = Sentry.createInstrumentedClaudeQuery({
  default: {
    cwd: process.cwd(),
  },
});

// GET /api/projects - List all projects from database
export async function GET() {
  try {
    const allProjects = await db.select().from(projects).orderBy(projects.createdAt);
    return NextResponse.json({ projects: allProjects });
  } catch (error) {
    console.error('Error fetching projects:', error);
    return NextResponse.json({ error: 'Failed to fetch projects' }, { status: 500 });
  }
}

// POST /api/projects - Create new project with Haiku metadata extraction
export async function POST(req: Request) {
  try {
    const { prompt } = await req.json();

    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
    }

    console.log('🤖 Extracting project metadata with Haiku...');

    // Try up to 2 times to get valid JSON from Haiku
    let jsonResponse = '';
    let attempts = 0;
    const maxAttempts = 2;

    while (attempts < maxAttempts && (!jsonResponse || jsonResponse.trim().length === 0)) {
      attempts++;
      console.log(`   Attempt ${attempts}/${maxAttempts}...`);

      try {
        // Use Haiku to extract metadata
        const metadataStream = query({
          prompt: `User wants to build: "${prompt}"

Generate project metadata as JSON.

Icons: Package, Rocket, Code, Zap, Database, Globe, ShoppingCart, Calendar, MessageSquare, Mail, FileText, Image, Music, Video, Book, Heart, Star, Users, Settings, Layout, Grid, List, Edit, Search, Filter, Download, Upload, Share, Lock, Key, Bell, Clock

Output ONLY this JSON (no text before or after):
{"slug":"kebab-case-name","friendlyName":"Friendly Name","description":"Brief description","icon":"IconName"}`,
          inputMessages: [],
          options: {
            model: 'claude-3-5-haiku-20241022',
            maxTurns: 1,
            systemPrompt: 'Output valid JSON only. No markdown. No explanations.',
          },
        });

        // Parse the response with timeout
        const timeout = setTimeout(() => {
          console.warn('⚠️  Haiku response timeout after 8 seconds');
        }, 8000);

        for await (const message of metadataStream) {
          if (message.type === 'assistant' && message.message?.content) {
            for (const block of message.message.content) {
              if (block.type === 'text' && block.text) {
                jsonResponse += block.text;
              }
            }
          }
        }

        clearTimeout(timeout);

        if (jsonResponse && jsonResponse.trim().length > 0) {
          console.log(`✅ Got response on attempt ${attempts}`);
          break;
        }
      } catch (error) {
        console.error(`❌ Attempt ${attempts} failed:`, error);
        if (attempts === maxAttempts) {
          console.log('⚠️  All Haiku attempts failed, will use fallback');
        }
      }
    }

    console.log('📥 Raw Haiku response:', JSON.stringify(jsonResponse));
    console.log('   Response length:', jsonResponse.length);

    // Extract JSON - handle multiple formats
    let metadata;

    // Check if response is empty
    if (!jsonResponse || jsonResponse.trim().length === 0) {
      console.warn('⚠️  Haiku returned empty response, using fallback');
      // Skip parsing, go straight to fallback
    } else {
      try {
        // Try 1: Remove markdown code blocks if present
        let cleanedResponse = jsonResponse.trim();
        cleanedResponse = cleanedResponse.replace(/```json\s*/g, '');
        cleanedResponse = cleanedResponse.replace(/```\s*/g, '');
        cleanedResponse = cleanedResponse.trim();

        // Try 2: Find JSON object in the text
        const jsonMatch = cleanedResponse.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          metadata = JSON.parse(jsonMatch[0]);
          console.log('📋 Parsed metadata:', metadata);
        } else {
          console.warn('⚠️  No JSON object found in Haiku response');
        }
      } catch (parseError) {
        console.error('❌ JSON parsing failed:', parseError);
        console.error('   Raw response was:', jsonResponse);
      }
    }

    // If metadata is still undefined, use fallback
    if (!metadata) {

      console.log('🔄 Falling back to simple metadata generation...');

      // Better slug generation
      const slug = prompt
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '') // Remove special chars
        .replace(/\s+/g, '-')          // Replace spaces with dashes
        .replace(/-+/g, '-')            // Replace multiple dashes with single
        .replace(/^-|-$/g, '')          // Remove leading/trailing dashes
        .substring(0, 50)               // Limit length
        .replace(/-$/, '');             // Remove trailing dash if any

      // Better friendly name (capitalize words)
      const friendlyName = prompt
        .substring(0, 50)
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');

      metadata = {
        slug: slug || 'project-' + Date.now(),
        friendlyName: friendlyName || 'New Project',
        description: prompt.substring(0, 150) || 'A new project',
        icon: 'Code',
      };

      console.log('📋 Fallback metadata:', metadata);
    }

    // Check for slug collision
    let finalSlug = metadata.slug;
    const existing = await db.select().from(projects).where(eq(projects.slug, finalSlug));

    if (existing.length > 0) {
      // Append timestamp to ensure uniqueness
      finalSlug = `${metadata.slug}-${Date.now()}`;
      console.log(`⚠️  Slug collision detected, using: ${finalSlug}`);
    }

    // Insert into database (path is calculated from slug, not stored)
    const newProject = await db.insert(projects).values({
      name: metadata.friendlyName,
      slug: finalSlug,
      description: metadata.description,
      originalPrompt: prompt, // Store the original user prompt
      icon: metadata.icon || 'Folder',
      status: 'pending',
      // path is deprecated - calculated from slug when needed
    }).returning();

    console.log('✅ Project created:', newProject[0].id);

    return NextResponse.json({ project: newProject[0] });
  } catch (error) {
    console.error('❌ Error creating project:', error);
    return NextResponse.json(
      { error: 'Failed to create project', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
