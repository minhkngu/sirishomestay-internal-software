CREATE TABLE "fee_type_prices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fee_type_id" uuid NOT NULL,
	"facility_id" uuid NOT NULL,
	"price" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fee_type_prices_fee_facility_unique" UNIQUE("fee_type_id","facility_id")
);
--> statement-breakpoint
ALTER TABLE "fee_type_prices" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "fee_type_prices" ADD CONSTRAINT "fee_type_prices_fee_type_id_fee_types_id_fk" FOREIGN KEY ("fee_type_id") REFERENCES "public"."fee_types"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_type_prices" ADD CONSTRAINT "fee_type_prices_facility_id_facilities_id_fk" FOREIGN KEY ("facility_id") REFERENCES "public"."facilities"("id") ON DELETE cascade ON UPDATE no action;