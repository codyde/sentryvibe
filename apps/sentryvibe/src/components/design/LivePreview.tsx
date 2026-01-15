'use client';

import { useEffect } from 'react';
import { getContrastTextColor } from '@/lib/utils';

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
    <div
      className="h-full rounded-lg border p-3 flex flex-col gap-2 overflow-y-auto"
      style={{
        backgroundColor: bgColor,
        borderColor: colorMode === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
      }}
    >
      {/* Heading */}
      <h2
        style={{
          fontFamily: typography.heading,
          color: textColor,
          fontSize: '1.25rem',
          fontWeight: 700,
          lineHeight: 1.2,
        }}
      >
        Dashboard
      </h2>

      {/* Body text */}
      <p
        style={{
          fontFamily: typography.body,
          color: textColor,
          fontSize: '0.8125rem',
          lineHeight: 1.5,
        }}
      >
        This is body text with your selected typography.
      </p>

      {/* Buttons */}
      <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap' }}>
        <button
          style={{
            backgroundColor: colors.primary,
            color: getContrastTextColor(colors.primary, colors.neutralLight, colors.neutralDark),
            padding: '0.375rem 0.75rem',
            borderRadius: '0.375rem',
            border: 'none',
            fontFamily: typography.body,
            fontWeight: 600,
            fontSize: '0.75rem',
          }}
        >
          Primary
        </button>

        <button
          style={{
            backgroundColor: colors.secondary,
            color: getContrastTextColor(colors.secondary, colors.neutralLight, colors.neutralDark),
            padding: '0.375rem 0.75rem',
            borderRadius: '0.375rem',
            border: 'none',
            fontFamily: typography.body,
            fontWeight: 600,
            fontSize: '0.75rem',
          }}
        >
          Secondary
        </button>

        <button
          style={{
            backgroundColor: colors.accent,
            color: getContrastTextColor(colors.accent, colors.neutralLight, colors.neutralDark),
            padding: '0.375rem 0.75rem',
            borderRadius: '0.375rem',
            border: 'none',
            fontFamily: typography.body,
            fontWeight: 600,
            fontSize: '0.75rem',
          }}
        >
          Accent
        </button>
      </div>

      {/* Color swatches */}
      <div style={{ display: 'flex', gap: '0.375rem', marginTop: '0.5rem' }}>
        {[
          { name: 'Pri', color: colors.primary },
          { name: 'Sec', color: colors.secondary },
          { name: 'Acc', color: colors.accent },
          { name: 'Lt', color: colors.neutralLight },
          { name: 'Dk', color: colors.neutralDark },
        ].map(({ name, color }) => (
          <div key={name} style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', alignItems: 'center' }}>
            <div
              style={{
                width: '2rem',
                height: '2rem',
                backgroundColor: color,
                borderRadius: '0.25rem',
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
  );
}
