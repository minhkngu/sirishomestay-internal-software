CREATE TABLE "fee_defaults" (
	"facility_id" uuid NOT NULL,
	"fee_type_id" uuid NOT NULL,
	CONSTRAINT "fee_defaults_facility_fee_unique" UNIQUE("facility_id","fee_type_id")
);
--> statement-breakpoint
ALTER TABLE "fee_defaults" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "fee_defaults" ADD CONSTRAINT "fee_defaults_facility_id_facilities_id_fk" FOREIGN KEY ("facility_id") REFERENCES "public"."facilities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_defaults" ADD CONSTRAINT "fee_defaults_fee_type_id_fee_types_id_fk" FOREIGN KEY ("fee_type_id") REFERENCES "public"."fee_types"("id") ON DELETE cascade ON UPDATE no action;