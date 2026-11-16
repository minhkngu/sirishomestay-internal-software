ALTER TABLE "meter_readings" DROP CONSTRAINT "meter_readings_meter_period_unique";--> statement-breakpoint
ALTER TABLE "addenda" ADD COLUMN "old_room_id" uuid;--> statement-breakpoint
ALTER TABLE "addenda" ADD COLUMN "old_occupant_ids" jsonb;--> statement-breakpoint
ALTER TABLE "meter_readings" ADD COLUMN "kind" text DEFAULT 'monthly' NOT NULL;--> statement-breakpoint
ALTER TABLE "addenda" ADD CONSTRAINT "addenda_old_room_id_rooms_id_fk" FOREIGN KEY ("old_room_id") REFERENCES "public"."rooms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "meter_readings_monthly_unique" ON "meter_readings" USING btree ("meter_id","period") WHERE "meter_readings"."kind" = 'monthly';--> statement-breakpoint
CREATE UNIQUE INDEX "meter_readings_handover_unique" ON "meter_readings" USING btree ("meter_id","read_on") WHERE "meter_readings"."kind" = 'handover';