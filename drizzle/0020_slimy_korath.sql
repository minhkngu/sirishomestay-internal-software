CREATE TABLE "invoice_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"config" jsonb NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "invoice_templates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "leases" ADD COLUMN "invoice_template_id" uuid;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "invoice_template_id" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "invoice_templates_one_default" ON "invoice_templates" USING btree ("is_default") WHERE "invoice_templates"."is_default";--> statement-breakpoint
ALTER TABLE "leases" ADD CONSTRAINT "leases_invoice_template_id_invoice_templates_id_fk" FOREIGN KEY ("invoice_template_id") REFERENCES "public"."invoice_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_invoice_template_id_invoice_templates_id_fk" FOREIGN KEY ("invoice_template_id") REFERENCES "public"."invoice_templates"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
INSERT INTO "invoice_templates" ("id", "name", "config", "is_default", "is_system") VALUES ('00000000-0000-4000-8000-000000000001', 'Mẫu hệ thống', '{"color":"#0E9F6E","brand":"SIRIS","title":"","footer":"","logo":"","sections":["header","customer","charges","total","payment","footer"],"hidden":[]}'::jsonb, true, true);
