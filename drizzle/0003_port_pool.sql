CREATE TABLE IF NOT EXISTS "port_allocations" (
  "port" integer PRIMARY KEY NOT NULL,
  "framework" text NOT NULL,
  "project_id" text,
  "reserved_at" integer,
  FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "port_allocations_framework_idx"
  ON "port_allocations" ("framework", "project_id");
