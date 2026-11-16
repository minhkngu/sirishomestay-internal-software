CREATE TABLE "one_off_charges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lease_id" uuid NOT NULL,
	"fee_type_id" uuid,
	"kind" text NOT NULL,
	"description" text NOT NULL,
	"date" date NOT NULL,
	"quantity" numeric NOT NULL,
	"unit_price" bigint NOT NULL,
	"invoice_id" uuid,
	"source" text,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pending_adjustments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lease_id" uuid NOT NULL,
	"description" text NOT NULL,
	"amount" bigint NOT NULL,
	"source_key" text NOT NULL,
	"invoice_id" uuid,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pending_adjustments_source_key_unique" UNIQUE("source_key")
);
--> statement-breakpoint
ALTER TABLE "one_off_charges" ADD CONSTRAINT "one_off_charges_lease_id_leases_id_fk" FOREIGN KEY ("lease_id") REFERENCES "public"."leases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "one_off_charges" ADD CONSTRAINT "one_off_charges_fee_type_id_fee_types_id_fk" FOREIGN KEY ("fee_type_id") REFERENCES "public"."fee_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_adjustments" ADD CONSTRAINT "pending_adjustments_lease_id_leases_id_fk" FOREIGN KEY ("lease_id") REFERENCES "public"."leases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "one_off_charges_lease_idx" ON "one_off_charges" USING btree ("lease_id");--> statement-breakpoint
CREATE INDEX "pending_adjustments_lease_idx" ON "pending_adjustments" USING btree ("lease_id");--> statement-breakpoint
ALTER TABLE "one_off_charges" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "pending_adjustments" ENABLE ROW LEVEL SECURITY;
