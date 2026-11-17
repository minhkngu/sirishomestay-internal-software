CREATE TABLE "lease_fee_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lease_id" uuid NOT NULL,
	"fee_type_id" uuid,
	"name" text NOT NULL,
	"unit" text NOT NULL,
	"quantity_source" text NOT NULL,
	"unit_price" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "leases" ADD COLUMN "fee_model" text DEFAULT 'legacy' NOT NULL;--> statement-breakpoint
ALTER TABLE "lease_fee_snapshots" ADD CONSTRAINT "lease_fee_snapshots_lease_id_leases_id_fk" FOREIGN KEY ("lease_id") REFERENCES "public"."leases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lease_fee_snapshots" ADD CONSTRAINT "lease_fee_snapshots_fee_type_id_fee_types_id_fk" FOREIGN KEY ("fee_type_id") REFERENCES "public"."fee_types"("id") ON DELETE no action ON UPDATE no action;