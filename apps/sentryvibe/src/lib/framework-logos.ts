/**
 * Get the logo path for a framework value
 * This is a simple lookup that works on both client and server
 */
export function getFrameworkLogo(frameworkValue: string): string | null {
  const logoMap: Record<string, string> = {
    'next': '/nextjs.png',
    'vite': '/reactjs.png',
    'astro': '/astro.png'
  };
  return logoMap[frameworkValue] || null;
}

