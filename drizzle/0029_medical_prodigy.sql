ALTER TABLE "meters" ADD COLUMN "final_reading_estimated" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "meters" ADD COLUMN "estimate_note" text;--> statement-breakpoint
ALTER TABLE "invoice_templates" ADD COLUMN "preview_pdf" text;--> statement-breakpoint
ALTER TABLE "invoice_templates" ADD COLUMN "preview_version" integer;