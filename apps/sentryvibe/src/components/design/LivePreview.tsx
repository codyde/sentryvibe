'use client';

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
}

export default function LivePreview({ colors, typography }: LivePreviewProps) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-gray-200">Live Preview</label>

      <div
        className="p-6 rounded-lg border transition-colors"
        style={{
          backgroundColor: colors.neutralLight,
          borderColor: 'rgba(255, 255, 255, 0.1)',
        }}
      >
        {/* Heading */}
        <h2
          style={{
            fontFamily: typography.heading,
            color: colors.neutralDark,
            fontSize: '2rem',
            fontWeight: 700,
            lineHeight: 1.2,
            marginBottom: '1rem',
          }}
        >
          Dashboard Heading
        </h2>

        {/* Body text */}
        <p
          style={{
            fontFamily: typography.body,
            color: colors.neutralDark,
            fontSize: '1rem',
            lineHeight: 1.6,
            marginBottom: '1.5rem',
          }}
        >
          This is body text with your selected typography. The design will use these exact colors and fonts throughout the application.
        </p>

        {/* Button examples */}
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
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
            Primary Button
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
              color: colors.neutralDark,
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
        <div style={{ marginTop: '1.5rem', display: 'flex', gap: '0.5rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <div
              style={{
                width: '3rem',
                height: '3rem',
                backgroundColor: colors.primary,
                borderRadius: '0.375rem',
                border: '1px solid rgba(0,0,0,0.1)',
              }}
              title="Primary"
            />
            <span style={{ fontSize: '0.625rem', color: colors.neutralDark, fontFamily: typography.body }}>
              Primary
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <div
              style={{
                width: '3rem',
                height: '3rem',
                backgroundColor: colors.secondary,
                borderRadius: '0.375rem',
                border: '1px solid rgba(0,0,0,0.1)',
              }}
              title="Secondary"
            />
            <span style={{ fontSize: '0.625rem', color: colors.neutralDark, fontFamily: typography.body }}>
              Secondary
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <div
              style={{
                width: '3rem',
                height: '3rem',
                backgroundColor: colors.accent,
                borderRadius: '0.375rem',
                border: '1px solid rgba(0,0,0,0.1)',
              }}
              title="Accent"
            />
            <span style={{ fontSize: '0.625rem', color: colors.neutralDark, fontFamily: typography.body }}>
              Accent
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <div
              style={{
                width: '3rem',
                height: '3rem',
                backgroundColor: colors.neutralDark,
                borderRadius: '0.375rem',
                border: '1px solid rgba(0,0,0,0.1)',
              }}
              title="Neutral Dark"
            />
            <span style={{ fontSize: '0.625rem', color: colors.neutralDark, fontFamily: typography.body }}>
              Dark
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
