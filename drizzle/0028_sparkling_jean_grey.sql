ALTER TABLE "invoice_templates" ADD COLUMN "body" text;--> statement-breakpoint
ALTER TABLE "invoice_templates" ADD COLUMN "style" text DEFAULT 'formal' NOT NULL;