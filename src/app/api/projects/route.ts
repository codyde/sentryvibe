import { NextResponse } from 'next/server';
import { join } from 'path';
import * as Sentry from '@sentry/nextjs';
import { db } from '@/lib/db/client';
import { projects } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

const query = Sentry.createInstrumentedClaudeQuery();

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

    // Use Haiku to extract metadata
    const metadataStream = query({
      prompt: `Given this project request, generate metadata in JSON format:
"${prompt}"

Choose an appropriate Lucide icon name from this list:
Package, Rocket, Code, Zap, Database, Globe, ShoppingCart, Calendar, MessageSquare, Mail, FileText, Image, Music, Video, Book, Heart, Star, Users, Settings, Layout, Grid, List, Edit, Search, Filter, Download, Upload, Share, Lock, Key, Bell, Clock, CheckCircle, XCircle, AlertCircle, Info, HelpCircle, Lightbulb, Target, Award, Briefcase, Coffee, Home, Puzzle, Box, Layers, Activity, TrendingUp, BarChart, PieChart, DollarSign, CreditCard, Smartphone, Monitor, Tablet, Cpu, Terminal, Cloud, Server, Wifi, Bluetooth, Camera, Mic

Respond with ONLY valid JSON in this exact format (no markdown, no code blocks):
{
  "slug": "kebab-case-project-name",
  "friendlyName": "Human Readable Project Name",
  "description": "Brief description of what this project does",
  "icon": "IconName"
}`,
      inputMessages: [],
      options: {
        model: 'claude-3-5-haiku-20241022',
        maxTurns: 1,
        systemPrompt: 'You are a project metadata generator. Only respond with valid JSON.',
      },
    });

    // Parse the response
    let jsonResponse = '';
    for await (const message of metadataStream) {
      if (message.type === 'assistant' && message.message?.content) {
        for (const block of message.message.content) {
          if (block.type === 'text' && block.text) {
            jsonResponse += block.text;
          }
        }
      }
    }

    // Extract JSON from potential markdown code blocks
    const jsonMatch = jsonResponse.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Failed to extract JSON from Haiku response');
    }

    const metadata = JSON.parse(jsonMatch[0]);
    console.log('📋 Generated metadata:', metadata);

    // Check for slug collision
    let finalSlug = metadata.slug;
    const existing = await db.select().from(projects).where(eq(projects.slug, finalSlug));

    if (existing.length > 0) {
      // Append timestamp to ensure uniqueness
      finalSlug = `${metadata.slug}-${Date.now()}`;
      console.log(`⚠️  Slug collision detected, using: ${finalSlug}`);
    }

    // Create project path
    const projectPath = join(process.cwd(), 'projects', finalSlug);

    // Insert into database
    const newProject = await db.insert(projects).values({
      name: metadata.friendlyName,
      slug: finalSlug,
      description: metadata.description,
      icon: metadata.icon || 'Folder',
      status: 'pending',
      path: projectPath,
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
