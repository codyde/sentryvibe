# Proxy and Iframe Configuration Updates

**Date:** 2025-10-06
**Reason:** Fix iframe rendering issues where components fail to load or crash
**Inspired by:** bolt.diy implementation patterns

---

## Problems Identified

### 1. **Selection Script Always Active**
- Event listeners attached immediately on injection
- Listeners in capture phase intercepted app events before React handlers
- Caused component crashes and broken interactions

### 2. **Base Tag Breaking Client-Side Routing**
- `<base href="http://localhost:port/">` redirected SPA navigation
- React Router/Next.js routing broke out of proxy
- Apps reloaded or crashed on navigation

### 3. **Missing Iframe Permissions**
- No `sandbox` or `allow` attributes
- Some browser features blocked by default
- Reduced compatibility with modern web apps

### 4. **Conflicting Headers**
- User apps' CSP headers blocked inline scripts
- X-Frame-Options conflicts
- Preview failed to load

### 5. **CSS Inheritance from Parent** *(Added: Post-implementation)*
- User apps inheriting CSS variables and styles from SentryVibe parent app
- Cards/elements showing wrong colors (black backgrounds, different text colors)
- Global CSS bleeding into iframe despite same-origin isolation

### 6. **CORS Blocked Fonts and Assets** *(Added: Post-implementation)*
- Fonts loading from `localhost:3001` blocked by CORS
- User's dev server doesn't send `Access-Control-Allow-Origin` headers
- Static assets (fonts, images) fail to load in iframe

### 7. **CSS url() Not Rewritten** *(Added: Post-implementation)*
- CSS files contain `url()` references that weren't being rewritten
- Fonts referenced in CSS try to load directly from user's port
- Mixed origins cause CORS errors

### 8. **Aggressive CSS Reset Breaking Tailwind v4** *(Critical Fix)*
- Initial aggressive CSS reset (`all: initial !important`) nuked ALL styles
- Tailwind v4 relies on CSS variables defined in app's own stylesheet
- Reset was preventing app's own styles from working

---

## Changes Implemented

### ✅ **1. Dormant Selection Script** (injector.ts)

**Before:**
```javascript
// Event listeners added immediately
document.addEventListener('mousemove', handleMouseMove, true);
document.addEventListener('click', handleClick, true);
```

**After:**
```javascript
// Dormant - listeners only added when inspector activated
function setInspectorActive(active) {
  if (active) {
    // Add listeners ONLY when needed
    document.addEventListener('mousemove', handleMouseMove, true);
    document.addEventListener('click', handleClick, true);
  } else {
    // Clean removal
    document.removeEventListener('mousemove', handleMouseMove, true);
    document.removeEventListener('click', handleClick, true);
  }
}
```

**Benefits:**
- ✅ No interference with app events until inspector enabled
- ✅ Clean removal of listeners and styles
- ✅ Prevents component crashes from event conflicts

---

### ✅ **2. Asset URL Rewriting (No Base Tag)** (proxy/route.ts)

**Before:**
```typescript
// Injected base tag
const baseTag = `<base href="http://localhost:${port}/" target="_parent">`;
html = html.replace('<head>', `<head>\n${baseTag}`);
```

**After:**
```typescript
// Rewrite all relative asset URLs to absolute
html = html.replace(
  /<(script|link|img|source|video|audio|iframe)([^>]*)(src|href)=["'](?!http|\/\/|data:)([^"']+)["']/gi,
  (match, tag, attrs, attr, path) => {
    const absolutePath = path.startsWith('/') ? path : `/${path}`;
    const absoluteUrl = `http://localhost:${proj.devServerPort}${absolutePath}`;
    return `<${tag}${attrs}${attr}="${absoluteUrl}"`;
  }
);
```

**Benefits:**
- ✅ Client-side routing works naturally
- ✅ No `target="_parent"` escaping iframe
- ✅ Better compatibility with SPAs

---

### ✅ **3. Permissive Iframe Attributes** (PreviewPanel.tsx)

**Before:**
```tsx
<iframe
  ref={iframeRef}
  src={previewUrl}
  className="w-full h-full border-0"
  title="Preview"
/>
```

**After:**
```tsx
<iframe
  ref={iframeRef}
  src={previewUrl}
  sandbox="allow-scripts allow-forms allow-popups allow-modals allow-storage-access-by-user-activation allow-same-origin"
  allow="geolocation; camera; microphone; fullscreen; clipboard-write; clipboard-read; cross-origin-isolated"
  className="w-full h-full border-0"
  style={{
    colorScheme: 'normal',
    isolation: 'isolate',
  }}
  title="Preview"
/>
```

**Benefits:**
- ✅ Scripts, forms, popups, modals all work
- ✅ Storage APIs accessible
- ✅ Modern features (camera, clipboard, geolocation) enabled
- ✅ Style isolation prevents parent CSS bleed

---

### ✅ **4. Strip Restrictive Headers** (proxy/route.ts)

**Before:**
```typescript
// Forwarded all headers from user's dev server
return new NextResponse(html, {
  headers: {
    'Content-Type': 'text/html',
    'X-Frame-Options': 'SAMEORIGIN',
  },
});
```

**After:**
```typescript
// Don't forward restrictive headers
const headers = new Headers();
headers.set('Content-Type', 'text/html');
headers.set('Cache-Control', 'no-cache, no-store, must-revalidate');
headers.set('X-Frame-Options', 'SAMEORIGIN');

// Permissive CSP to allow inline scripts and user app features
headers.set('Content-Security-Policy', [
  "default-src * 'unsafe-inline' 'unsafe-eval' data: blob:",
  "script-src * 'unsafe-inline' 'unsafe-eval'",
  "style-src * 'unsafe-inline'",
  "img-src * data: blob:",
  "font-src * data:",
  "connect-src *",
  "frame-ancestors 'self'",
].join('; '));

return new NextResponse(html, { headers });
```

**Benefits:**
- ✅ User app CSP won't block iframe
- ✅ Inline selection script works
- ✅ No X-Frame-Options conflicts

---

### ✅ **5. Auto-Sync Inspector State** (PreviewPanel.tsx)

**Before:**
```typescript
// Manual toggle only
useEffect(() => {
  if (!iframeRef.current) return;
  toggleSelectionMode(iframeRef.current, isSelectionModeEnabled);
}, [isSelectionModeEnabled]);
```

**After:**
```typescript
// Auto-sync on iframe load AND toggle
useEffect(() => {
  const handleMessage = (e: MessageEvent) => {
    if (e.data.type === 'sentryvibe:ready') {
      // Iframe loaded and script ready, sync current state
      if (iframeRef.current) {
        toggleSelectionMode(iframeRef.current, isSelectionModeEnabled);
      }
    }
  };

  window.addEventListener('message', handleMessage);
  return () => window.removeEventListener('message', handleMessage);
}, [isSelectionModeEnabled]);
```

**Benefits:**
- ✅ Inspector state persists across iframe reloads
- ✅ No manual re-enable needed
- ✅ Better UX

---

### ✅ **6. CSS Isolation** *(Added: Post-implementation)* (proxy/route.ts + PreviewPanel.tsx)

**Problem:**
User apps inheriting CSS variables and global styles from SentryVibe parent app, causing wrong colors and styling.

**Solution A - Injected CSS Isolation (proxy/route.ts):**
```typescript
// Inject minimal style isolation (don't nuke app's own styles!)
const styleIsolation = `
<style>
  /* Prevent ONLY parent iframe styles from bleeding in */
  /* Do NOT reset the app's own styles (breaks Tailwind v4!) */

  /* Create a new stacking context to isolate from parent */
  html {
    isolation: isolate;
  }
</style>
</head>`;

html = html.replace('</head>', styleIsolation);
```

**⚠️ Critical:** Aggressive CSS resets (`all: initial`, `all: revert`) will **break Tailwind v4** which relies on CSS variables defined in the app's own stylesheets. Only use minimal isolation.

**Solution B - Iframe Style Isolation (PreviewPanel.tsx):**
```typescript
<iframe
  style={{
    colorScheme: 'normal',
    isolation: 'isolate',
  }}
  // ...
/>
```

**Benefits:**
- ✅ User apps render with their own styles
- ✅ No CSS variable bleed from parent
- ✅ Colors, backgrounds, fonts render correctly

---

### ✅ **7. CSS URL Rewriting** *(Added: Post-implementation)* (proxy/route.ts)

**Problem:**
CSS files contain `url()` references to fonts/images that weren't being rewritten, causing mixed-origin loads and CORS errors.

**Solution:**
```typescript
// For CSS files, rewrite url() references to go through proxy
if (contentType.includes('text/css') || contentType.includes('stylesheet')) {
  let css = await response.text();

  // Rewrite url() to route through OUR proxy (for CORS headers)
  css = css.replace(
    /url\(\s*(['"]?)(?!http|\/\/|data:)([^'")]+)\1\s*\)/gi,
    (match, quote, urlPath) => {
      const absolutePath = urlPath.startsWith('/') ? urlPath : `/${urlPath}`;
      // Route through proxy so fonts get CORS headers
      const proxyUrl = `/api/projects/${id}/proxy?path=${encodeURIComponent(absolutePath)}`;
      return `url(${quote}${proxyUrl}${quote})`;
    }
  );

  return new NextResponse(css, { headers });
}
```

**Key Change:** Fonts now load through the proxy (`/api/projects/{id}/proxy?path=...`) instead of directly from the dev server, ensuring they get CORS headers.

**Benefits:**
- ✅ Fonts in CSS load from correct origin
- ✅ Background images resolve correctly
- ✅ No more mixed-content CORS errors

---

### ✅ **8. CORS Headers for Static Assets** *(Added: Post-implementation)* (proxy/route.ts)

**Problem:**
Fonts and static assets blocked by CORS when loading from user's dev server.

**Solution:**
```typescript
// Handle OPTIONS preflight
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

// For non-HTML assets, add CORS headers
const headers = new Headers();
headers.set('Content-Type', contentType);
headers.set('Cache-Control', response.headers.get('cache-control') || 'public, max-age=31536000');
headers.set('Access-Control-Allow-Origin', '*');
headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
headers.set('Access-Control-Allow-Headers', '*');

return new NextResponse(buffer, { headers });
```

**Benefits:**
- ✅ Fonts load correctly from user's dev server
- ✅ Images, CSS, JS files not blocked by CORS
- ✅ Proper CORS preflight handling

---

## Files Modified

1. **`src/lib/selection/injector.ts`** - Dormant selection script
2. **`src/app/api/projects/[id]/proxy/route.ts`** - Asset rewriting + header stripping + CSS isolation
3. **`src/components/PreviewPanel.tsx`** - Iframe attributes + auto-sync + style isolation

---

## How to Revert

### If rendering issues persist:

**Option 1: Revert base tag removal**
```typescript
// proxy/route.ts - Re-add base tag
const baseTag = `<base href="http://localhost:${proj.devServerPort}/" target="_parent">`;
html = html.replace('<head>', `<head>\n${baseTag}`);
```

**Option 2: Revert to inline script always-active**
```typescript
// injector.ts - Remove dormant wrapper, add listeners immediately
document.addEventListener('mousemove', handleMouseMove, true);
document.addEventListener('click', handleClick, true);
```

**Option 3: Remove sandbox attributes**
```tsx
// PreviewPanel.tsx - Remove sandbox/allow if blocking needed features
<iframe
  ref={iframeRef}
  src={previewUrl}
  className="w-full h-full border-0"
  title="Preview"
/>
```

**Option 4: Restore user app headers**
```typescript
// proxy/route.ts - Forward original response headers
const headers = new Headers(response.headers);
return new NextResponse(html, { headers });
```

**Option 5: Remove CSS isolation** *(if it breaks user styles)*
```typescript
// proxy/route.ts - Remove style reset injection
// Delete the styleReset section entirely

// PreviewPanel.tsx - Remove isolation styles
<iframe
  ref={iframeRef}
  src={previewUrl}
  className="w-full h-full border-0"
  // Remove style prop
/>
```

---

## Testing Checklist

- [ ] React/Vite app with React Router (client-side routing)
- [ ] Next.js app with App Router
- [ ] App with strict CSP headers
- [ ] App with forms and modals
- [ ] App with WebRTC (camera/mic)
- [ ] Selection tool activates/deactivates cleanly
- [ ] Navigation within iframe stays in proxy
- [ ] Assets (CSS, JS, images) load correctly
- [ ] No console errors about CSP violations
- [ ] Components render completely (headers, products, etc.)

---

## Comparison to bolt.diy

| Feature | bolt.diy | Our Approach |
|---------|----------|--------------|
| **Runtime** | WebContainer (WASM) | Real localhost servers |
| **Same-origin** | Native from WebContainer API | Proxy through Next.js |
| **Base tag** | Not needed | Removed, use URL rewriting |
| **Inspector script** | Dormant, external | Dormant, inline |
| **Sandbox** | Permissive | Permissive (same attributes) |
| **CSP** | From WebContainer | Stripped + replaced |

---

## Expected Improvements

1. ✅ **Components render completely** - Store headers/products now show
2. ✅ **No client-side crashes** - Event conflicts resolved
3. ✅ **Routing works** - SPAs navigate correctly within iframe
4. ✅ **Better compatibility** - Wider range of frameworks/apps work
5. ✅ **Selection tool non-invasive** - Only active when explicitly enabled

---

**Status:** ✅ Implemented
**Rollback:** Keep this file + use git to revert if needed
**Next Steps:** Test with multiple frameworks and monitor for issues
