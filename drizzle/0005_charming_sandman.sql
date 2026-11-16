CREATE TABLE "addenda" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lease_id" uuid NOT NULL,
	"type" text NOT NULL,
	"effective_date" date NOT NULL,
	"new_end_date" date,
	"new_room_id" uuid,
	"new_monthly_rent" bigint,
	"new_deposit_amount" bigint,
	"new_fees" jsonb,
	"new_occupant_ids" jsonb,
	"deposit_forfeit" jsonb,
	"adjustment_target" text DEFAULT 'next' NOT NULL,
	"sign_status" text DEFAULT 'draft' NOT NULL,
	"signed_file_id" uuid,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "addenda" ADD CONSTRAINT "addenda_lease_id_leases_id_fk" FOREIGN KEY ("lease_id") REFERENCES "public"."leases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "addenda" ADD CONSTRAINT "addenda_new_room_id_rooms_id_fk" FOREIGN KEY ("new_room_id") REFERENCES "public"."rooms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "addenda_lease_idx" ON "addenda" USING btree ("lease_id");--> statement-breakpoint
ALTER TABLE "addenda" ENABLE ROW LEVEL SECURITY;
