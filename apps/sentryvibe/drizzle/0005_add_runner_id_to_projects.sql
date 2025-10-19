-- Add runner_id column to projects table to track which runner manages each project
ALTER TABLE "projects" ADD COLUMN "runner_id" text;
