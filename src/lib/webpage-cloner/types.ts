export interface ClonedAsset {
  type: 'image' | 'font' | 'stylesheet' | 'script';
  url: string;
  localPath?: string;
  data?: Buffer;
}

export interface ClonedWebpage {
  html: string;
  css: string;
  computedStyles: ComputedStyleMap;
  assets: ClonedAsset[];
  techStack: TechStack;
  metadata: {
    title: string;
    description: string;
    favicon?: string;
    viewport?: string;
  };
  originalUrl: string;
}

export interface ComputedStyleMap {
  [selector: string]: {
    [property: string]: string;
  };
}

export interface TechStack {
  framework?: 'react' | 'nextjs' | 'vue' | 'astro' | 'angular' | 'plain';
  bundler?: 'vite' | 'webpack' | 'parcel' | 'none';
  styling?: 'tailwind' | 'css' | 'scss' | 'styled-components';
  detectedLibraries: string[];
}

export interface CloneOptions {
  url: string;
  waitForNetworkIdle?: boolean;
  captureAssets?: boolean;
  timeout?: number;
  viewport?: {
    width: number;
    height: number;
  };
}
