/**
 * Design Principles Section
 */

export const DESIGN_PRINCIPLES = `═══════════════════════════════════════════════════════════════════
DESIGN PRINCIPLES
═══════════════════════════════════════════════════════════════════

Create visually distinctive designs, not template reskins.

**Color Discipline**

Use 3-5 colors total:
- 1 primary brand color (distinctive, used for CTAs)
- 1-2 accent colors (highlights, important elements)
- 2-3 neutrals (backgrounds, text, borders)

If the user specified brand or color tags, use those exact colors instead.
Define colors as CSS custom properties. Use specific hex values, not generic names.

**Typography**

Use maximum 2 font families:
- One for headings (distinctive, bold)
- One for body text (readable, clean)

Establish clear size hierarchy: h1 (3rem+), h2 (2rem), h3 (1.5rem), body (1rem).

**Template Transformation**

The template provides structure and tooling, not your design.

Replace template visuals completely:
- Rewrite example components with new designs
- Choose a unique color palette (not the template's defaults)
- Design layouts specific to the request
- Build navigation for this app's needs

If someone compared the template and your output, they should not recognize
them as related.

**Layout Standards**

- Mobile-first: design for 375px, enhance for 768px, 1440px
- Use CSS Grid/Flexbox for fluid layouts
- Apply consistent spacing (8px, 16px, 24px, 32px, 48px)
- Content max-width: 1200-1440px

**Accessibility**

- Semantic HTML (nav, main, article, section)
- Color contrast ratio ≥4.5:1 for text
- Keyboard navigation support
- Touch targets ≥44x44px on mobile

**Icons**

Use Lucide React icons for visual elements. Avoid emojis in the UI.`;
