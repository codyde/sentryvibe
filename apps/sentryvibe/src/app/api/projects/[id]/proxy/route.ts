import { NextResponse } from 'next/server';
import { db } from '@sentryvibe/agent-core/lib/db/client';
import { projects } from '@sentryvibe/agent-core/lib/db/schema';
import { eq } from 'drizzle-orm';
import { SELECTION_SCRIPT } from '@sentryvibe/agent-core/lib/selection/injector';

/**
 * Simple, robust proxy for dev servers
 * Routes ALL requests through this endpoint to avoid CORS issues
 */

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': '*',
    },
  });
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const url = new URL(req.url);
    const path = url.searchParams.get('path') || '/';

    // Get project
    const project = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
    if (project.length === 0) {
      return new NextResponse('Project not found', { status: 404 });
    }

    const proj = project[0];

    // Check if server running
    if (proj.devServerStatus !== 'running' || !proj.devServerPort) {
      return new NextResponse('Dev server not running', { status: 503 });
    }

    // Fetch from dev server
    const targetUrl = `http://localhost:${proj.devServerPort}${path}`;
    const response = await fetch(targetUrl);
    const contentType = response.headers.get('content-type') || '';
    const isViteChunk = path.includes('/node_modules/.vite/') || /chunk-[A-Z0-9]+\.js/i.test(path);

    // HTML - Inject base tag and selection script
    if (contentType.includes('text/html')) {
      let html = await response.text();

      // Inject base tag FIRST (before ANY content)
      const baseTag = `<head>
    <base href="/api/projects/${id}/proxy?path=/">`;
      if (/<head>/i.test(html)) {
        html = html.replace(/<head>/i, baseTag);
      }

      // Rewrite src/href attributes that point to absolute root paths
      html = html.replace(
        /(src|href)=(["'])(\/(?!\/)[^"']*)(["'])/gi,
        (match, attr, quote, assetPath) => {
          if (assetPath.startsWith('/api/projects/')) return match;
          const proxyUrl = `/api/projects/${id}/proxy?path=${encodeURIComponent(assetPath)}`;
          return `${attr}=${quote}${proxyUrl}${quote}`;
        }
      );

      // Rewrite inline module imports in <script type="module"> tags
      html = html.replace(
        /<script\s+type=["']module["']>([\s\S]*?)<\/script>/gi,
        (match, scriptContent) => {
          // Rewrite imports inside inline scripts
          const rewritten = scriptContent.replace(
            /(from\s+["']|import\s*\(["'])(\/[^"']+)(["'])/g,
            (importMatch: string, prefix: string, importPath: string, suffix: string) => {
              const proxyUrl = `/api/projects/${id}/proxy?path=${encodeURIComponent(importPath)}`;
              return `${prefix}${proxyUrl}${suffix}`;
            }
          );
          return `<script type="module">${rewritten}</script>`;
        }
      );

      // Inject selection script before closing body
      const scriptTag = `<script>${SELECTION_SCRIPT}</script></body>`;
      if (/<\/body>/i.test(html)) {
        html = html.replace(/<\/body>/i, scriptTag);
      } else {
        html += `<script>${SELECTION_SCRIPT}</script>`;
      }

      return new NextResponse(html, {
        headers: {
          'Content-Type': 'text/html',
          'Cache-Control': 'no-cache',
        },
      });
    }

    // JavaScript/TypeScript - Rewrite imports to go through proxy
    if (
      contentType.includes('javascript') ||
      contentType.includes('typescript') ||
      path.includes('/@vite/') ||
      path.includes('/@react-refresh') ||
      path.endsWith('.tsx') ||
      path.endsWith('.ts') ||
      path.endsWith('.jsx') ||
      path.endsWith('.mjs')
    ) {
      let js = await response.text();

      // Rewrite ALL absolute imports to go through our proxy
      js = js.replace(
        /(from\s+["']|import\s*\(\s*["']|import\s+["']|require\s*\(\s*["']|export\s+\*\s+from\s+["'])(\/[^"']+)(["'])/g,
        (match, prefix, importPath, suffix) => {
          // Skip if already proxied
          if (importPath.includes('/api/projects/')) return match;

          const proxyUrl = `/api/projects/${id}/proxy?path=${encodeURIComponent(importPath)}`;
          return `${prefix}${proxyUrl}${suffix}`;
        }
      );

      const cacheControl = isViteChunk
        ? 'public, max-age=600, immutable'
        : 'no-cache';

      return new NextResponse(js, {
        headers: {
          'Content-Type': contentType,
          'Cache-Control': cacheControl,
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    // CSS - Rewrite url() paths
    if (contentType.includes('text/css') || contentType.includes('stylesheet')) {
      let css = await response.text();

      css = css.replace(
        /url\(\s*(['"]?)(?!http|data:|#)([^'")]+)\1\s*\)/gi,
        (match, quote, urlPath) => {
          const cleanPath = urlPath.trim();
          const absolutePath = cleanPath.startsWith('/') ? cleanPath : `/${cleanPath}`;
          const proxyUrl = `/api/projects/${id}/proxy?path=${encodeURIComponent(absolutePath)}`;
          return `url(${quote}${proxyUrl}${quote})`;
        }
      );

      const cacheControl = isViteChunk
        ? 'public, max-age=600, immutable'
        : 'no-cache';

      return new NextResponse(css, {
        headers: {
          'Content-Type': contentType,
          'Cache-Control': cacheControl,
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    // Everything else - Just proxy with CORS headers
    const buffer = await response.arrayBuffer();

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': response.headers.get('cache-control') || 'public, max-age=31536000',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': '*',
      },
    });

  } catch (error) {
    console.error('❌ Proxy error:', error);
    return new NextResponse('Proxy failed', { status: 500 });
  }
}
