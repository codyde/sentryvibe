import { parse, HTMLElement, TextNode } from 'node-html-parser';
import type { ClonedWebpage } from './types';

const SELF_CLOSING_TAGS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr',
]);

const HTML_TO_JSX_ATTRIBUTE_MAP: Record<string, string> = {
  'class': 'className',
  'for': 'htmlFor',
  'tabindex': 'tabIndex',
  'readonly': 'readOnly',
  'maxlength': 'maxLength',
  'cellpadding': 'cellPadding',
  'cellspacing': 'cellSpacing',
  'rowspan': 'rowSpan',
  'colspan': 'colSpan',
  'classname': 'className',
};

function convertAttributeName(name: string): string {
  const lowerName = name.toLowerCase();

  // Handle data-* and aria-* attributes
  if (lowerName.startsWith('data-') || lowerName.startsWith('aria-')) {
    return lowerName;
  }

  // Handle on* event handlers
  if (lowerName.startsWith('on')) {
    return lowerName.replace(/^on/, 'on').replace(/^on(.)/, (_, char) => 'on' + char.toUpperCase());
  }

  return HTML_TO_JSX_ATTRIBUTE_MAP[lowerName] || lowerName;
}

function convertStyleString(styleString: string): string {
  if (!styleString || styleString.trim() === '') return '{}';

  const styles = styleString.split(';')
    .filter(s => s.trim())
    .map(s => {
      const [property, value] = s.split(':').map(p => p.trim());
      if (!property || !value) return '';

      // Convert kebab-case to camelCase
      const camelProperty = property.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());

      // Handle numeric values that need units
      const quotedValue = value.match(/^[0-9.]+$/) ? value : `'${value.replace(/'/g, "\\'")}'`;

      return `${camelProperty}: ${quotedValue}`;
    })
    .filter(Boolean)
    .join(', ');

  return `{{ ${styles} }}`;
}

function sanitizeText(text: string): string {
  return text
    .replace(/\{/g, '&#123;')
    .replace(/\}/g, '&#125;');
}

function htmlElementToJSX(element: HTMLElement, depth: number = 0): string {
  const indent = '  '.repeat(depth);
  const tagName = element.rawTagName?.toLowerCase() || 'div';

  // Skip script and style tags
  if (tagName === 'script' || tagName === 'style') {
    return '';
  }

  // Convert attributes
  const attributes: string[] = [];
  const attrs = element.attributes || {};

  for (const [name, value] of Object.entries(attrs)) {
    const jsxName = convertAttributeName(name);

    if (jsxName === 'style') {
      attributes.push(`style={${convertStyleString(value)}}`);
    } else if (jsxName.startsWith('on')) {
      // Remove inline event handlers
      continue;
    } else if (typeof value === 'boolean' || value === '') {
      attributes.push(jsxName);
    } else {
      const escapedValue = value.replace(/"/g, '&quot;');
      attributes.push(`${jsxName}="${escapedValue}"`);
    }
  }

  const attrsString = attributes.length > 0 ? ' ' + attributes.join(' ') : '';

  // Handle self-closing tags
  if (SELF_CLOSING_TAGS.has(tagName)) {
    return `${indent}<${tagName}${attrsString} />`;
  }

  // Process children
  const children: string[] = [];
  element.childNodes.forEach((child) => {
    if (child instanceof HTMLElement) {
      const childJSX = htmlElementToJSX(child, depth + 1);
      if (childJSX) children.push(childJSX);
    } else if (child instanceof TextNode) {
      const text = child.text.trim();
      if (text) {
        children.push(`${indent}  ${sanitizeText(text)}`);
      }
    }
  });

  if (children.length === 0) {
    return `${indent}<${tagName}${attrsString} />`;
  }

  const childrenString = children.join('\n');
  return `${indent}<${tagName}${attrsString}>\n${childrenString}\n${indent}</${tagName}>`;
}

export function convertHtmlToReact(clonedData: ClonedWebpage, projectName: string): {
  appTsx: string;
  appCss: string;
} {
  console.log('🔄 Converting HTML to React...');

  // Parse the HTML
  const root = parse(clonedData.html);

  // Extract body content
  const body = root.querySelector('body');
  const bodyContent = body ? htmlElementToJSX(body, 0) : '<div>No content</div>';

  // Remove the outer <body> tags (we just want the content)
  const contentWithoutBody = bodyContent
    .replace(/^\s*<body[^>]*>\n?/, '')
    .replace(/\n?\s*<\/body>\s*$/, '');

  // Create App.tsx
  const appTsx = `import './App.css';

export default function App() {
  return (
    <div className="cloned-page">
${contentWithoutBody.split('\n').map(line => '      ' + line).join('\n')}
    </div>
  );
}
`;

  // Create App.css with cloned styles
  const appCss = `/* Cloned from: ${clonedData.originalUrl} */

/* Reset */
* {
  box-sizing: border-box;
}

/* Cloned Styles */
${clonedData.css}

/* Additional computed styles */
.cloned-page {
  min-height: 100vh;
}
`;

  console.log('✅ HTML converted to React');

  return { appTsx, appCss };
}

export function generateClonedProject(clonedData: ClonedWebpage, projectName: string): {
  files: Array<{ path: string; content: string }>;
} {
  const { appTsx, appCss } = convertHtmlToReact(clonedData, projectName);

  const files = [
    {
      path: 'src/App.tsx',
      content: appTsx,
    },
    {
      path: 'src/App.css',
      content: appCss,
    },
  ];

  return { files };
}
