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
  const { id } = await params;
  const url = new URL(req.url);
  const path = url.searchParams.get('path') || '/';
  let proj: (typeof projects.$inferSelect) | undefined;

  try {
    // Get project
    const project = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
    if (project.length === 0) {
      return new NextResponse('Project not found', { status: 404 });
    }

    proj = project[0];

    // Check if server running
    if (proj.devServerStatus !== 'running' || !proj.devServerPort) {
      return new NextResponse('Dev server not running', { status: 503 });
    }

    // Determine target URL based on where the USER is accessing the frontend from
    // Check the Host header to see if frontend is being accessed locally or remotely
    const requestHost = req.headers.get('host') || '';
    const frontendIsLocal = requestHost.includes('localhost') || requestHost.includes('127.0.0.1');

    let targetUrl: string;

    if (frontendIsLocal) {
      // User accessing frontend via localhost (e.g., http://localhost:3000)
      // This means frontend and runner are on the SAME machine
      // Proxy can directly access runner's localhost
      targetUrl = `http://localhost:${proj.devServerPort}${path}`;
    } else if (proj.tunnelUrl) {
      // User accessing frontend via remote URL (e.g., sentryvibe.up.railway.app)
      // Frontend and runner are on DIFFERENT machines
      // Proxy must use tunnel to reach runner
      targetUrl = `${proj.tunnelUrl}${path}`;
      console.log(`[proxy] Frontend accessed via ${requestHost} - using tunnel ${proj.tunnelUrl}`);
    } else {
      // Frontend accessed remotely but no tunnel exists yet
      // Return a special status that frontend can detect and handle gracefully
      console.warn(`[proxy] Remote access via ${requestHost} - waiting for tunnel to be created for project ${id}`);
      return new NextResponse(
        'Waiting for tunnel...',
        { status: 202, headers: { 'X-Tunnel-Status': 'pending' } }
      );
    }
    const response = await fetch(targetUrl);
    const contentType = response.headers.get('content-type') || '';
    const isViteChunk = path.includes('/node_modules/.vite/') || /chunk-[A-Z0-9]+\.js/i.test(path);

    // HTML - Inject base tag, Vite config, and selection script
    if (contentType.includes('text/html')) {
      let html = await response.text();

      // Inject base tag and pathname fix FIRST (before ANY content)
      // CRITICAL: Fix window.location.pathname for TanStack Router BEFORE it initializes
      const pathFixScript = `<script>
(function() {
  try {
    // Extract actual path from proxy URL
    const url = new URL(window.location.href);
    const actualPath = url.searchParams.get('path') || '/';

    // Use history.replaceState to change pathname without reload
    // This makes Router see the correct path
    if (window.location.pathname !== actualPath) {
      const newUrl = window.location.origin + actualPath + (url.hash || '');
      history.replaceState(null, '', newUrl);
    }
  } catch (e) {
    console.warn('[SentryVibe] Path normalization failed:', e);
  }
})();
</script>`;

      const baseTag = `<head>
    ${pathFixScript}
    <base href="/api/projects/${id}/proxy?path=/">`;
      if (/<head>/i.test(html)) {
        html = html.replace(/<head>/i, baseTag);
      }

      // Inject fetch interceptor for TanStack Start server functions
      const fetchInterceptor = `<script>
(function() {
  const originalFetch = window.fetch;
  const proxyPrefix = '/api/projects/${id}/proxy?path=';

  window.fetch = function(resource, options) {
    // Intercept TanStack Start server function calls
    if (typeof resource === 'string' && resource.startsWith('/_serverFn/')) {
      const proxiedUrl = proxyPrefix + encodeURIComponent(resource);
      return originalFetch(proxiedUrl, options);
    }
    return originalFetch(resource, options);
  };
})();
</script>`;

      // Inject after base tag
      if (/<base[^>]*>/i.test(html)) {
        html = html.replace(/(<base[^>]*>)/i, `$1\n${fetchInterceptor}`);
      }

      // Rewrite src/href attributes that point to absolute root paths
      html = html.replace(
        /(src|href)=(["'])(\/(?!\/)[^"']*)(["'])/gi,
        (match, attr, quote, assetPath) => {
          if (assetPath.startsWith('/api/projects/')) return match;

          // CRITICAL: Add ?direct for CSS files to get actual CSS from Vite
          let pathWithParams = assetPath;
          if (assetPath.match(/\.css$/i) && !assetPath.includes('?')) {
            pathWithParams = `${assetPath}?direct`;
          }

          const proxyUrl = `/api/projects/${id}/proxy?path=${encodeURIComponent(pathWithParams)}`;
          return `${attr}=${quote}${proxyUrl}${quote}`;
        }
      );

      // Rewrite inline module imports in <script type="module"> tags
      // Must handle attributes like async, defer, etc.
      html = html.replace(
        /<script\s+([^>]*?type=["']module["'][^>]*?)>([\s\S]*?)<\/script>/gi,
        (match, attrs, scriptContent) => {
          // Rewrite imports inside inline scripts
          const rewritten = scriptContent.replace(
            /(from\s+["']|import\s*\(["'])(\/[^"']+)(["'])/g,
            (importMatch: string, prefix: string, importPath: string, suffix: string) => {
              const proxyUrl = `/api/projects/${id}/proxy?path=${encodeURIComponent(importPath)}`;
              return `${prefix}${proxyUrl}${suffix}`;
            }
          );
          return `<script ${attrs}>${rewritten}</script>`;
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
    // CRITICAL: Also rewrite CSS imports for TanStack Start
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

      // CRITICAL: Handle Vite ?url responses specially
      // They export URL strings like: export default "/src/styles.css"
      const isViteUrlExport = path.includes('?url');

      if (isViteUrlExport) {
        // For ?url exports, rewrite the exported path to include proxy and ?direct
        // This prevents hydration mismatches
        js = js.replace(
          /export\s+default\s+"(\/[^"]+\.css)"/g,
          (match, cssPath) => {
            const pathWithDirect = `${cssPath}?direct`;
            const proxyUrl = `/api/projects/${id}/proxy?path=${encodeURIComponent(pathWithDirect)}`;
            return `export default "${proxyUrl}"`;
          }
        );
      } else {
        // TanStack Start Fix: Rewrite CSS imports with ?url parameter
        // Pattern: import appCss from '../styles.css?url'
        // This is the ROOT CAUSE fix - CSS URLs are embedded in JS constants
        js = js.replace(
          /(from\s+["'])([^"']+\.css)(\?url)?(["'])/g,
          (match, prefix, cssPath, urlParam, suffix) => {
            // Skip if already proxied
            if (cssPath.includes('/api/projects/')) return match;

            // Resolve relative paths to absolute
            let absolutePath = cssPath;
            if (cssPath.startsWith('./') || cssPath.startsWith('../')) {
              // Get the directory of the current module
              const moduleDir = path.substring(0, path.lastIndexOf('/'));
              // Resolve relative to absolute
              const resolved = new URL(cssPath, `http://dummy${moduleDir}/`).pathname;
              absolutePath = resolved;
            }

            // Keep the ?url parameter when proxying
            const proxyUrl = `/api/projects/${id}/proxy?path=${encodeURIComponent(absolutePath)}${urlParam || ''}`;
            return `${prefix}${proxyUrl}${suffix}`;
          }
        );
      }

      // Rewrite ALL absolute imports to go through our proxy
      // But NOT for Vite ?url responses (they just export URL strings)
      if (!isViteUrlExport) {
        js = js.replace(
          /(from\s+["']|import\s*\(\s*["']|import\s+["']|require\s*\(\s*["']|export\s+\*\s+from\s+["'])(\/[^"']+)(["'])/g,
          (match, prefix, importPath, suffix) => {
            // Skip if already proxied
            if (importPath.includes('/api/projects/')) return match;
            // Skip CSS files (already handled above)
            if (importPath.endsWith('.css')) return match;

            const proxyUrl = `/api/projects/${id}/proxy?path=${encodeURIComponent(importPath)}`;
            return `${prefix}${proxyUrl}${suffix}`;
          }
        );
      }

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
    console.error('   Project:', id);
    console.error('   Path:', path);
    console.error('   Port:', proj?.devServerPort);
    console.error('   Tunnel URL:', proj?.tunnelUrl);
    console.error('   Dev server status:', proj?.devServerStatus);
    return new NextResponse(
      `Proxy failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      { status: 500 }
    );
  }
}
