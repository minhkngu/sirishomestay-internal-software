DROP INDEX "invoice_templates_one_default";--> statement-breakpoint
ALTER TABLE "invoice_templates" ADD COLUMN "kind" text DEFAULT 'standard' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "invoice_templates_one_default" ON "invoice_templates" USING btree ("kind","is_default") WHERE "invoice_templates"."is_default";