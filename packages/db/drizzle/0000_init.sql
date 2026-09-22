CREATE TABLE IF NOT EXISTS "users" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "email" text NOT NULL,
  "api_key_hash" text,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "users_email_uidx" ON "users" ("email");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "watches" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "url" text NOT NULL,
  "canonical_url" text NOT NULL,
  "dedupe_key" text NOT NULL,
  "site" text,
  "threshold" numeric(12, 2),
  "currency" text,
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "watches" ADD CONSTRAINT "watches_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "watches_user_dedupe_uidx" ON "watches" ("user_id", "dedupe_key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "watches_dedupe_key_idx" ON "watches" ("dedupe_key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "watches_user_id_idx" ON "watches" ("user_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "price_history" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "watch_id" uuid NOT NULL,
  "job_id" uuid NOT NULL,
  "price" numeric(12, 2) NOT NULL,
  "currency" text NOT NULL,
  "title" text,
  "source" text NOT NULL,
  "scraped_at" timestamptz NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "price_history" ADD CONSTRAINT "price_history_watch_id_watches_id_fk"
    FOREIGN KEY ("watch_id") REFERENCES "public"."watches"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "price_history_job_id_uidx" ON "price_history" ("job_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "price_history_watch_id_idx" ON "price_history" ("watch_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "price_history_scraped_at_idx" ON "price_history" ("scraped_at");
