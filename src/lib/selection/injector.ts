/**
 * Script injected into preview iframe for element selection
 * This runs in the iframe's context and communicates with parent via postMessage
 */

export const SELECTION_SCRIPT = `
(function() {
  console.log('🎯 SentryVibe selection script loaded');
  console.log('   window.parent exists:', !!window.parent);
  console.log('   window.parent.postMessage exists:', typeof window.parent.postMessage);

  // Selection state
  window.__SENTRYVIBE_SELECTION_ENABLED = false;
  let highlightedElement = null;
  let highlightOverlay = null;

  // Create highlight overlay
  function createHighlightOverlay() {
    if (highlightOverlay) return highlightOverlay;

    const overlay = document.createElement('div');
    overlay.id = '__sentryvibe-highlight';
    overlay.style.cssText = \`
      position: absolute;
      pointer-events: none;
      border: 2px solid #7553FF;
      background: rgba(117, 83, 255, 0.1);
      z-index: 999999;
      transition: all 0.1s ease;
      box-shadow: 0 0 0 1px rgba(117, 83, 255, 0.3), 0 0 20px rgba(117, 83, 255, 0.4);
    \`;
    document.body.appendChild(overlay);
    highlightOverlay = overlay;
    return overlay;
  }

  // Remove highlight overlay
  function removeHighlightOverlay() {
    if (highlightOverlay) {
      highlightOverlay.remove();
      highlightOverlay = null;
    }
  }

  // Highlight element on hover
  function highlightElement(element) {
    if (!element || !window.__SENTRYVIBE_SELECTION_ENABLED) {
      removeHighlightOverlay();
      return;
    }

    const rect = element.getBoundingClientRect();
    const overlay = createHighlightOverlay();

    overlay.style.left = rect.left + window.scrollX + 'px';
    overlay.style.top = rect.top + window.scrollY + 'px';
    overlay.style.width = rect.width + 'px';
    overlay.style.height = rect.height + 'px';

    highlightedElement = element;
  }

  // Generate unique CSS selector for element
  function generateSelector(element) {
    // Strategy 1: data-testid (best)
    const testId = element.getAttribute('data-testid');
    if (testId) {
      return \`[data-testid="\${testId}"]\`;
    }

    // Strategy 2: ID (good)
    if (element.id) {
      return \`#\${element.id}\`;
    }

    // Strategy 3: Class + tag (ok) - but skip classes with colons (Tailwind responsive)
    const classes = Array.from(element.classList)
      .filter(c => !c.match(/^(hover:|focus:|active:|group-|animate-|transition-)/))
      .filter(c => !c.includes(':')) // Skip Tailwind responsive classes
      .slice(0, 3) // Limit to first 3 classes
      .join('.');

    if (classes) {
      const tagName = element.tagName.toLowerCase();

      try {
        // Check if unique enough
        const selector = \`\${tagName}.\${classes}\`;
        const matches = document.querySelectorAll(selector);

        if (matches.length === 1) {
          return selector;
        }

        // Add nth-child if multiple matches
        const parent = element.parentElement;
        if (parent) {
          const siblings = Array.from(parent.children);
          const index = siblings.indexOf(element) + 1;
          return \`\${selector}:nth-child(\${index})\`;
        }

        return selector;
      } catch (err) {
        console.warn('Invalid selector, falling back to path:', err);
      }
    }

    // Strategy 4: Full path (fallback)
    return getFullPath(element);
  }

  // Get full CSS path to element
  function getFullPath(element) {
    const path = [];
    let current = element;

    while (current && current !== document.body) {
      let selector = current.tagName.toLowerCase();

      if (current.id) {
        selector += \`#\${current.id}\`;
        path.unshift(selector);
        break;
      }

      const parent = current.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter(
          child => child.tagName === current.tagName
        );

        if (siblings.length > 1) {
          const index = siblings.indexOf(current) + 1;
          selector += \`:nth-of-type(\${index})\`;
        }
      }

      path.unshift(selector);
      current = current.parentElement;
    }

    return path.join(' > ');
  }

  // Capture element data and click position
  function captureElementData(element, clickEvent) {
    const rect = element.getBoundingClientRect();

    return {
      selector: generateSelector(element),
      tagName: element.tagName.toLowerCase(),
      className: element.className,
      id: element.id,
      textContent: element.textContent?.trim().slice(0, 100),
      innerHTML: element.innerHTML?.slice(0, 200),
      attributes: Array.from(element.attributes).reduce((acc, attr) => {
        acc[attr.name] = attr.value;
        return acc;
      }, {}),
      boundingRect: {
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
      },
      clickPosition: {
        x: clickEvent.clientX,
        y: clickEvent.clientY,
      },
      computedStyles: {
        backgroundColor: window.getComputedStyle(element).backgroundColor,
        color: window.getComputedStyle(element).color,
        fontSize: window.getComputedStyle(element).fontSize,
        fontFamily: window.getComputedStyle(element).fontFamily,
      }
    };
  }

  // Mouse move handler (hover preview)
  function handleMouseMove(e) {
    if (!window.__SENTRYVIBE_SELECTION_ENABLED) return;

    const element = e.target;
    if (element && element !== highlightedElement) {
      highlightElement(element);
    }
  }

  // Click handler (select element)
  function handleClick(e) {
    console.log('🖱️ Click detected, selection mode:', window.__SENTRYVIBE_SELECTION_ENABLED);

    if (!window.__SENTRYVIBE_SELECTION_ENABLED) return;

    e.preventDefault();
    e.stopPropagation();

    const element = e.target;
    const data = captureElementData(element, e);

    console.log('🎯 Element captured:', data);
    console.log('   Click position:', data.clickPosition);
    console.log('📤 Sending postMessage to parent...');

    // Send to parent window
    window.parent.postMessage({
      type: 'sentryvibe:element-selected',
      data,
    }, '*');

    console.log('✅ Message sent to parent');

    // Disable selection mode after selection
    window.__SENTRYVIBE_SELECTION_ENABLED = false;
    updateCursor();
    removeHighlightOverlay();
  }

  // Update cursor based on mode
  function updateCursor() {
    document.body.style.cursor = window.__SENTRYVIBE_SELECTION_ENABLED ? 'crosshair' : '';
  }

  // Listen for mode toggle from parent
  window.addEventListener('message', (e) => {
    if (e.data.type === 'sentryvibe:toggle-selection-mode') {
      window.__SENTRYVIBE_SELECTION_ENABLED = e.data.enabled;
      updateCursor();

      console.log('🎯 Selection mode:', window.__SENTRYVIBE_SELECTION_ENABLED ? 'ENABLED' : 'DISABLED');

      if (!e.data.enabled) {
        removeHighlightOverlay();
      }
    }
  });

  // Add event listeners
  document.addEventListener('mousemove', handleMouseMove, true);
  document.addEventListener('click', handleClick, true);

  console.log('✅ Selection handlers attached');
})();
`;

/**
 * Inject selection script into iframe
 */
export function injectSelectionScript(iframe: HTMLIFrameElement): boolean {
  try {
    const iframeWindow = iframe.contentWindow;
    if (!iframeWindow) {
      console.error('❌ Cannot access iframe window');
      return false;
    }

    const iframeDoc = iframeWindow.document;
    if (!iframeDoc) {
      console.error('❌ Cannot access iframe document');
      return false;
    }

    // Check if script already injected
    if (iframeDoc.getElementById('__sentryvibe-selection-script')) {
      console.log('⚠️  Selection script already injected');
      return true;
    }

    // Create and inject script element
    const script = iframeDoc.createElement('script');
    script.id = '__sentryvibe-selection-script';
    script.textContent = SELECTION_SCRIPT;
    iframeDoc.body.appendChild(script);

    console.log('✅ Selection script injected into iframe');
    return true;
  } catch (error) {
    console.error('❌ Failed to inject selection script:', error);
    return false;
  }
}

/**
 * Toggle selection mode in iframe
 */
export function toggleSelectionMode(iframe: HTMLIFrameElement, enabled: boolean): void {
  const iframeWindow = iframe.contentWindow;
  if (!iframeWindow) {
    console.error('❌ Cannot access iframe window');
    return;
  }

  iframeWindow.postMessage({
    type: 'sentryvibe:toggle-selection-mode',
    enabled,
  }, '*');

  console.log(`🎯 Selection mode toggled:`, enabled);
}
