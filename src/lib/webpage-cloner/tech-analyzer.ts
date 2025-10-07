import type { TechStack } from './types';

export function analyzeTechStack(html: string, pageContext: any): TechStack {
  const detectedLibraries: string[] = [];
  let framework: TechStack['framework'] = 'plain';
  let bundler: TechStack['bundler'] = 'none';
  let styling: TechStack['styling'] = 'css';

  // Check for React
  if (
    html.includes('data-reactroot') ||
    html.includes('data-react-') ||
    html.includes('__REACT_DEVTOOLS') ||
    pageContext?.React
  ) {
    framework = 'react';
    detectedLibraries.push('React');
  }

  // Check for Next.js (takes precedence over React)
  if (
    html.includes('__NEXT_DATA__') ||
    html.includes('/_next/') ||
    html.includes('__next') ||
    pageContext?.__NEXT_DATA__
  ) {
    framework = 'nextjs';
    detectedLibraries.push('Next.js');
  }

  // Check for Vue
  if (
    html.includes('data-v-') ||
    html.includes('v-if') ||
    html.includes('v-for') ||
    pageContext?.Vue
  ) {
    framework = 'vue';
    detectedLibraries.push('Vue');
  }

  // Check for Astro
  if (
    html.includes('astro-island') ||
    html.includes('data-astro-') ||
    html.includes('astro-slot')
  ) {
    framework = 'astro';
    detectedLibraries.push('Astro');
  }

  // Check for Angular
  if (
    html.includes('ng-version') ||
    html.includes('ng-app') ||
    html.includes('ng-controller') ||
    pageContext?.ng
  ) {
    framework = 'angular';
    detectedLibraries.push('Angular');
  }

  // Check for Vite
  if (
    html.includes('/@vite/') ||
    html.includes('vite/client') ||
    html.includes('type="module"')
  ) {
    bundler = 'vite';
    detectedLibraries.push('Vite');
  }

  // Check for Webpack
  if (
    html.includes('webpack') ||
    html.includes('webpackJsonp') ||
    html.includes('__webpack')
  ) {
    bundler = 'webpack';
    detectedLibraries.push('Webpack');
  }

  // Check for Tailwind CSS
  if (
    html.includes('class="') &&
    (html.match(/class="[^"]*\b(flex|grid|bg-|text-|p-|m-|w-|h-)/g)?.length || 0) > 5
  ) {
    styling = 'tailwind';
    detectedLibraries.push('Tailwind CSS');
  }

  // Check for styled-components
  if (html.includes('sc-') && html.includes('data-styled')) {
    styling = 'styled-components';
    detectedLibraries.push('styled-components');
  }

  // Check for SCSS/SASS
  if (html.includes('.scss') || html.includes('.sass')) {
    styling = 'scss';
    detectedLibraries.push('SCSS/SASS');
  }

  return {
    framework,
    bundler,
    styling,
    detectedLibraries,
  };
}

export function mapTechStackToTemplate(techStack: TechStack): string {
  // Map detected framework to template ID
  switch (techStack.framework) {
    case 'nextjs':
      return 'nextjs-fullstack';
    case 'astro':
      return 'astro-static';
    case 'react':
      return 'react-vite';
    case 'vue':
      // Default to Vite for Vue (we could add a Vue template later)
      return 'react-vite';
    default:
      // Plain HTML or unknown -> convert to React with Vite
      return 'react-vite';
  }
}
