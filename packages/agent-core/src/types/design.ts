export interface DesignPreferences {
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
  mood: string[];
  version?: number; // For future schema changes
}

export const DEFAULT_COLORS = {
  primary: "#6366f1",      // Indigo
  secondary: "#8b5cf6",    // Purple
  accent: "#ec4899",       // Pink
  neutralLight: "#f9fafb", // Gray 50
  neutralDark: "#111827",  // Gray 900
};

export const DEFAULT_TYPOGRAPHY = {
  heading: "Inter",
  body: "System UI",
};

export const MOOD_OPTIONS = [
  // Tone
  "Modern", "Professional", "Playful", "Minimal", "Luxurious",
  // Feel
  "Trustworthy", "Friendly", "Bold", "Elegant", "Energetic",
  // Visual
  "Clean", "Sophisticated", "Vibrant", "Warm", "Tech-forward"
] as const;

export const PRESET_FONTS = {
  heading: [
    "Inter",
    "Poppins",
    "Montserrat",
    "Space Grotesk",
    "Playfair Display"
  ],
  body: [
    "System UI",
    "Inter",
    "Open Sans",
    "Roboto",
    "Work Sans"
  ]
} as const;

export const DEFAULT_DESIGN_PREFERENCES: DesignPreferences = {
  colors: DEFAULT_COLORS,
  typography: DEFAULT_TYPOGRAPHY,
  mood: ["Modern", "Professional"],
  version: 1,
};

// Mood guidance for system prompt injection
export const MOOD_GUIDANCE: Record<string, string> = {
  "Modern": "Clean lines, ample white space, contemporary patterns",
  "Professional": "Polished, consistent, attention to detail",
  "Playful": "Rounded shapes, friendly interactions, lighthearted touches",
  "Minimal": "Essential elements only, generous spacing, restrained palette use",
  "Luxurious": "Premium feel, refined details, sophisticated presentation",
  "Trustworthy": "Clear hierarchy, readable typography, familiar patterns",
  "Friendly": "Approachable, warm colors, inviting interactions",
  "Bold": "Strong contrasts, large typography, confident visual statements",
  "Elegant": "Refined details, subtle transitions, sophisticated spacing",
  "Energetic": "Vibrant colors, dynamic layouts, active feeling",
  "Clean": "Uncluttered, focused, clear visual hierarchy",
  "Sophisticated": "Refined aesthetics, balanced composition, mature style",
  "Vibrant": "Rich colors, high energy, lively presence",
  "Warm": "Inviting colors, soft edges, approachable feel",
  "Tech-forward": "Sharp edges, monospace accents, futuristic elements",
};
