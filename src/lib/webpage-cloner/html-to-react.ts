import { parse, HTMLElement, TextNode } from 'node-html-parser';
import type { ClonedWebpage, ComputedStyleMap } from './types';

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

  return `{ ${styles} }`;
}

function sanitizeText(text: string): string {
  return text
    .replace(/\{/g, '&#123;')
    .replace(/\}/g, '&#125;');
}

function convertComputedStylesToReactStyle(computedStyle: { [key: string]: string }): string | null {
  const styleEntries: string[] = [];

  // Properties to always skip (defaults, internals, noise)
  const skipProperties = new Set([
    // WebKit internals
    'WebkitBorderHorizontalSpacing', 'WebkitBorderVerticalSpacing',
    'WebkitBoxAlign', 'WebkitBoxDecorationBreak', 'WebkitBoxFlex',
    'WebkitBoxOrdinalGroup', 'WebkitBoxOrient', 'WebkitBoxPack',
    'WebkitLocale', 'WebkitMaskBoxImageOutset', 'WebkitMaskBoxImageRepeat',
    'WebkitMaskBoxImageSlice', 'WebkitPrintColorAdjust', 'WebkitRtlOrdering',
    'WebkitTapHighlightColor', 'WebkitTextFillColor', 'WebkitTextOrientation',
    'WebkitTextStrokeColor', 'WebkitTextStrokeWidth', 'WebkitUserModify',
    'WebkitWritingMode',

    // Animation defaults
    'animationComposition', 'animationDelay', 'animationDuration',
    'animationIterationCount', 'animationPlayState', 'animationTimingFunction',
    'animationName', 'animationFillMode',

    // Transition defaults
    'transitionDelay', 'transitionDuration', 'transitionProperty', 'transitionTimingFunction',

    // SVG/obscure properties
    'baselineShift', 'clipRule', 'colorInterpolation', 'colorInterpolationFilters',
    'cx', 'cy', 'r', 'x', 'y', 'fill', 'fillRule', 'fillOpacity', 'floodColor', 'floodOpacity',
    'lightingColor', 'stopColor', 'stopOpacity', 'strokeDashoffset', 'strokeLinecap',
    'strokeLinejoin', 'strokeMiterlimit', 'strokeOpacity', 'strokeWidth', 'textAnchor',

    // Layout defaults we rarely need
    'backfaceVisibility', 'captionSide', 'emptyCells', 'tableLayout',
    'borderCollapse', 'listStylePosition', 'orphans', 'widows',
    'rubyAlign', 'rubyPosition', 'unicodeBidi', 'writingMode',

    // Image/object defaults
    'imageOrientation', 'objectFit', 'objectPosition',

    // Scroll/overflow defaults that are usually inherited
    'overflowClipMargin', 'scrollTimelineAxis', 'viewTimelineAxis',

    // Field sizing, interpolation
    'fieldSizing', 'interpolateSize', 'positionVisibility',

    // Shape/mask defaults
    'shapeImageThreshold', 'shapeMargin', 'maskClip', 'maskComposite',
    'maskMode', 'maskOrigin', 'maskPosition', 'maskRepeat', 'maskType',

    // Other noise
    'mathDepth', 'hyphens', 'textWrapMode', 'whiteSpaceCollapse',
    'caretColor', 'textEmphasisColor', 'textEmphasisPosition',
    'textDecorationColor', 'textDecorationStyle', 'outlineColor',
    'outlineOffset', 'outlineWidth',

    // Border block/inline (duplicates of border-left/right/top/bottom)
    'borderBlockEndColor', 'borderBlockEndWidth', 'borderBlockStartColor', 'borderBlockStartWidth',
    'borderInlineEndColor', 'borderInlineEndWidth', 'borderInlineStartColor', 'borderInlineStartWidth',
    'borderEndEndRadius', 'borderEndStartRadius', 'borderStartEndRadius', 'borderStartStartRadius',
    'paddingBlockEnd', 'paddingBlockStart', 'paddingInlineEnd', 'paddingInlineStart',
    'marginBlockEnd', 'marginBlockStart', 'marginInlineEnd', 'marginInlineStart',

    // Scroll margins (almost always 0)
    'scrollMarginBlockEnd', 'scrollMarginBlockStart', 'scrollMarginInlineEnd', 'scrollMarginInlineStart',

    // Background properties that are usually default
    'backgroundAttachment', 'backgroundClip', 'backgroundOrigin', 'backgroundPosition', 'backgroundRepeat',

    // Border image (usually not used)
    'borderImageOutset', 'borderImageRepeat', 'borderImageSlice', 'borderImageWidth',

    // Transform origins (usually not critical)
    'transformOrigin', 'perspectiveOrigin',

    // Offset properties
    'offsetDistance', 'offsetRotate',

    // Box decoration
    'boxDecorationBreak',
  ]);

  // Default values that indicate "not set"
  const isDefaultValue = (prop: string, value: string): boolean => {
    // Common defaults
    if (value === 'none' || value === 'normal' || value === 'auto') return true;
    if (value === '0px' || value === '0') {
      // Keep certain 0 values (like top, left for positioning)
      if (['top', 'left', 'right', 'bottom', 'zIndex'].includes(prop)) return false;
      return true;
    }
    if (value === 'rgba(0, 0, 0, 0)' || value === 'transparent') return true;
    if (value === 'initial' || value === 'inherit' || value === 'unset') return true;

    // Position static is default
    if (prop === 'position' && value === 'static') return true;

    // Opacity 1 is default
    if (prop === 'opacity' && value === '1') return true;

    // Zoom 1 is default
    if (prop === 'zoom' && value === '1') return true;

    // Flex defaults
    if (prop === 'flexGrow' && value === '0') return true;
    if (prop === 'flexShrink' && value === '1') return true;
    if (prop === 'flexDirection' && value === 'row') return true;
    if (prop === 'flexWrap' && value === 'nowrap') return true;

    // Grid defaults
    if (prop === 'gridAutoFlow' && value === 'row') return true;

    // Order default
    if (prop === 'order' && value === '0') return true;

    // Visibility default
    if (prop === 'visibility' && value === 'visible') return true;

    // Text decoration defaults
    if (prop === 'textDecoration' && value.includes('none solid')) return true;

    // Border radius 0
    if (prop.includes('borderRadius') && value === '0px') return true;

    // Outline when 0
    if (prop.includes('outline') && (value === '0px' || value.includes('0px'))) return true;

    // Background defaults
    if (prop === 'backgroundAttachment' && value === 'scroll') return true;
    if (prop === 'backgroundClip' && value === 'border-box') return true;
    if (prop === 'backgroundOrigin' && value === 'padding-box') return true;
    if (prop === 'backgroundPosition' && value === '0% 0%') return true;
    if (prop === 'backgroundRepeat' && value === 'repeat') return true;

    // Border image defaults
    if (prop.includes('borderImage') && (value === 'none' || value === 'stretch' || value === '100%' || value === '1' || value === '0')) return true;

    // Transform defaults
    if (prop === 'transformStyle' && value === 'flat') return true;
    if (prop.includes('transformOrigin')) return true; // Usually not critical

    // Perspective defaults
    if (prop.includes('perspectiveOrigin')) return true;

    // Offset defaults
    if (prop.includes('offset') && value === '0px') return true;
    if (prop === 'offsetRotate' && value.includes('auto 0deg')) return true;

    // Scroll margin (almost always 0)
    if (prop.includes('scrollMargin') && value === '0px') return true;

    // Text sizing
    if (prop === 'textSizeAdjust' && value === '100%') return true;

    // Tab size default
    if (prop === 'tabSize' && value === '8') return true;

    // Text indent 0
    if (prop === 'textIndent' && value === '0px') return true;

    // Text overflow clip
    if (prop === 'textOverflow' && value === 'clip') return true;

    // Vertical align baseline
    if (prop === 'verticalAlign' && value === 'baseline') return true;

    // Word spacing 0
    if (prop === 'wordSpacing' && value === '0px') return true;

    // Direction ltr (default)
    if (prop === 'direction' && value === 'ltr') return true;

    // List style type disc (default)
    if (prop === 'listStyleType' && value === 'disc') return true;

    // Text align - keep left, but skip if start
    if (prop === 'textAlign' && value === 'start') return true;

    // Block/inline size - usually same as width/height
    if (prop === 'blockSize' || prop === 'inlineSize') return true;

    // Min sizes at 0
    if (prop.includes('min') && (value === '0px' || value === 'auto')) return true;

    // Border colors when border width is 0 (meaningless)
    if (prop.includes('border') && prop.includes('Color')) {
      // We'll skip these if we detect the border width is also 0
      // For now, keep them and filter later if needed
    }

    // Column rule defaults
    if (prop.includes('columnRule') && value === '0px') return true;

    return false;
  };

  // First pass: collect all styles
  const allStyles: { [key: string]: string } = {};
  for (const [prop, value] of Object.entries(computedStyle)) {
    if (!skipProperties.has(prop) && !isDefaultValue(prop, value) && value) {
      allStyles[prop] = value;
    }
  }

  // Second pass: Remove border colors if corresponding border width is 0
  const borderSides = ['Top', 'Right', 'Bottom', 'Left'];
  for (const side of borderSides) {
    const widthProp = `border${side}Width`;
    const colorProp = `border${side}Color`;

    if (allStyles[widthProp] === '0px' && allStyles[colorProp]) {
      delete allStyles[colorProp];
      delete allStyles[widthProp];
    }
  }

  for (const [prop, value] of Object.entries(allStyles)) {
    // Format value for React style object
    let formattedValue: string;

    // Handle numeric values (add quotes for non-numbers)
    if (/^-?\d+(\.\d+)?(px|em|rem|%|vh|vw|pt)?$/.test(value)) {
      formattedValue = `'${value}'`;
    } else {
      // Escape quotes in value
      formattedValue = `'${value.replace(/'/g, "\\'")}'`;
    }

    styleEntries.push(`${prop}: ${formattedValue}`);
  }

  if (styleEntries.length === 0) {
    return null;
  }

  const result = `{ ${styleEntries.join(', ')} }`;

  // Log filtering stats (debug)
  const originalCount = Object.keys(computedStyle).length;
  const filteredCount = styleEntries.length;
  if (originalCount > 0 && filteredCount < originalCount * 0.3) {
    // Only log when we've filtered significantly
    console.log(`   Filtered ${originalCount} → ${filteredCount} properties (${Math.round((1 - filteredCount/originalCount) * 100)}% reduction)`);
  }

  return result;
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
      // Convert style string to React style object
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
  console.log(`   HTML size: ${(clonedData.html.length / 1024).toFixed(0)}KB`);

  // Parse the HTML (styles are already injected in the style attributes)
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

  // Create minimal App.css (styles are inlined)
  const appCss = `/* Cloned from: ${clonedData.originalUrl} */
/* All styles are inlined on elements for pixel-perfect accuracy */

/* Minimal Reset */
* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen',
    'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue',
    sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

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
