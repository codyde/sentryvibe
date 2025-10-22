'use client';

import { useEffect } from 'react';

interface LivePreviewProps {
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    neutralLight: string;
    neutralDark: string;
  };
  typography: {
    heading: string;
    body: string;
  };
  colorMode: 'light' | 'dark';
}

export default function LivePreview({ colors, typography, colorMode }: LivePreviewProps) {
  // Dynamically load Google Fonts when typography changes
  useEffect(() => {
    const loadFont = (fontFamily: string) => {
      // Skip loading for system fonts
      if (fontFamily === 'System UI' || fontFamily.includes('system-ui')) {
        return;
      }

      // Check if font is already loaded
      const existingLink = document.querySelector(`link[data-font="${fontFamily}"]`);
      if (existingLink) return;

      // Create link element for Google Fonts
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = `https://fonts.googleapis.com/css2?family=${fontFamily.replace(/ /g, '+')}:wght@300;400;600;700&display=swap`;
      link.setAttribute('data-font', fontFamily);
      document.head.appendChild(link);
    };

    loadFont(typography.heading);
    loadFont(typography.body);
  }, [typography.heading, typography.body]);

  const bgColor = colorMode === 'light' ? colors.neutralLight : colors.neutralDark;
  const textColor = colorMode === 'light' ? colors.neutralDark : colors.neutralLight;

  return (
    <div className="flex-1 flex flex-col h-full">
      <div
        className="flex-1 p-4 rounded-lg border transition-all overflow-y-auto"
        style={{
          backgroundColor: bgColor,
          borderColor: 'rgba(255, 255, 255, 0.1)',
        }}
      >
        {/* Heading */}
        <h2
          style={{
            fontFamily: typography.heading,
            color: textColor,
            fontSize: '1.5rem',
            fontWeight: 700,
            lineHeight: 1.2,
            marginBottom: '0.75rem',
          }}
        >
          Dashboard Heading
        </h2>

        {/* Body text */}
        <p
          style={{
            fontFamily: typography.body,
            color: textColor,
            fontSize: '0.875rem',
            lineHeight: 1.6,
            marginBottom: '1rem',
          }}
        >
          This is body text with your selected typography. The design will use these exact colors and fonts.
        </p>

        {/* Button examples */}
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
          <button
            style={{
              backgroundColor: colors.primary,
              color: colors.neutralLight,
              padding: '0.5rem 1rem',
              borderRadius: '0.5rem',
              border: 'none',
              fontFamily: typography.body,
              fontWeight: 600,
              fontSize: '0.875rem',
              cursor: 'pointer',
            }}
          >
            Primary
          </button>

          <button
            style={{
              backgroundColor: colors.secondary,
              color: colors.neutralLight,
              padding: '0.5rem 1rem',
              borderRadius: '0.5rem',
              border: 'none',
              fontFamily: typography.body,
              fontWeight: 600,
              fontSize: '0.875rem',
              cursor: 'pointer',
            }}
          >
            Secondary
          </button>

          <button
            style={{
              backgroundColor: colors.accent,
              color: colorMode === 'dark' ? colors.neutralDark : colors.neutralLight,
              padding: '0.5rem 1rem',
              borderRadius: '0.5rem',
              border: 'none',
              fontFamily: typography.body,
              fontWeight: 600,
              fontSize: '0.875rem',
              cursor: 'pointer',
            }}
          >
            Accent
          </button>
        </div>

        {/* Color swatches */}
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
          {[
            { name: 'Primary', color: colors.primary },
            { name: 'Secondary', color: colors.secondary },
            { name: 'Accent', color: colors.accent },
            { name: 'Light', color: colors.neutralLight },
            { name: 'Dark', color: colors.neutralDark },
          ].map(({ name, color }) => (
            <div key={name} style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', alignItems: 'center' }}>
              <div
                style={{
                  width: '2.5rem',
                  height: '2.5rem',
                  backgroundColor: color,
                  borderRadius: '0.375rem',
                  border: `1px solid ${colorMode === 'dark' ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.1)'}`,
                }}
                title={name}
              />
              <span style={{
                fontSize: '0.625rem',
                color: textColor,
                fontFamily: typography.body
              }}>
                {name}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
