/**
 * Get the logo path for a framework value
 * This is a simple lookup that works on both client and server
 */
export function getFrameworkLogo(frameworkValue: string): string | null {
  const logoMap: Record<string, string> = {
    'next': '/logos/nextjs.svg',
    'vite': '/logos/react.svg',
    'astro': '/astro.png',
    'tanstack': '/logos/tanstack.png'
  };
  return logoMap[frameworkValue] || null;
}
