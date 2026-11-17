CREATE TABLE "invoice_fee_quantities" (
	"invoice_id" uuid NOT NULL,
	"lease_fee_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	CONSTRAINT "invoice_fee_quantity_unique" UNIQUE("invoice_id","lease_fee_id")
);
--> statement-breakpoint
ALTER TABLE "invoice_fee_quantities" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "invoice_fee_quantities" ADD CONSTRAINT "invoice_fee_quantities_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_fee_quantities" ADD CONSTRAINT "invoice_fee_quantities_lease_fee_id_lease_fee_snapshots_id_fk" FOREIGN KEY ("lease_fee_id") REFERENCES "public"."lease_fee_snapshots"("id") ON DELETE no action ON UPDATE no action;