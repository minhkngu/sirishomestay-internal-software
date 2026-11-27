CREATE TABLE "tenant_wallet_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"facility_id" uuid NOT NULL,
	"amount" bigint NOT NULL,
	"kind" text NOT NULL,
	"lease_id" uuid,
	"invoice_id" uuid,
	"payment_id" uuid,
	"date" date NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"source_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_wallet_entries_source_key_unique" UNIQUE("source_key")
);
--> statement-breakpoint
ALTER TABLE "leases" ADD COLUMN "transfer_from_lease_id" uuid;--> statement-breakpoint
ALTER TABLE "tenant_wallet_entries" ADD CONSTRAINT "tenant_wallet_entries_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_wallet_entries" ADD CONSTRAINT "tenant_wallet_entries_facility_id_facilities_id_fk" FOREIGN KEY ("facility_id") REFERENCES "public"."facilities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_wallet_entries" ADD CONSTRAINT "tenant_wallet_entries_lease_id_leases_id_fk" FOREIGN KEY ("lease_id") REFERENCES "public"."leases"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_wallet_entries" ADD CONSTRAINT "tenant_wallet_entries_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_wallet_entries" ADD CONSTRAINT "tenant_wallet_entries_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tenant_wallet_entries_tenant_idx" ON "tenant_wallet_entries" USING btree ("tenant_id","facility_id");--> statement-breakpoint
ALTER TABLE "leases" ADD CONSTRAINT "leases_transfer_from_lease_id_leases_id_fk" FOREIGN KEY ("transfer_from_lease_id") REFERENCES "public"."leases"("id") ON DELETE no action ON UPDATE no action;