-- Add detectedFramework column to projects table
ALTER TABLE "projects" ADD COLUMN "detected_framework" text;

-- Add comment
COMMENT ON COLUMN "projects"."detected_framework" IS 'Auto-detected framework type (astro, next, vite, node, etc.) from project files';

