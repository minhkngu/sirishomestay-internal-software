CREATE TABLE "lease_fee_meters" (
	"lease_fee_id" uuid PRIMARY KEY NOT NULL,
	"meter_id" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lease_fee_meters" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "meters" ADD COLUMN "fee_type_id" uuid;--> statement-breakpoint
ALTER TABLE "lease_fee_meters" ADD CONSTRAINT "lease_fee_meters_lease_fee_id_lease_fee_snapshots_id_fk" FOREIGN KEY ("lease_fee_id") REFERENCES "public"."lease_fee_snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lease_fee_meters" ADD CONSTRAINT "lease_fee_meters_meter_id_meters_id_fk" FOREIGN KEY ("meter_id") REFERENCES "public"."meters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meters" ADD CONSTRAINT "meters_fee_type_id_fee_types_id_fk" FOREIGN KEY ("fee_type_id") REFERENCES "public"."fee_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "meters_active_room_fee_unique" ON "meters" USING btree ("room_id","fee_type_id") WHERE "meters"."removed_on" is null and "meters"."fee_type_id" is not null;