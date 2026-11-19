ALTER TABLE "doc_templates" ADD COLUMN "body" text;--> statement-breakpoint
ALTER TABLE "doc_templates" ADD COLUMN "style" text DEFAULT 'formal' NOT NULL;