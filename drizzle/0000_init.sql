CREATE TYPE "public"."tenant_kind" AS ENUM('foreign', 'vietnamese', 'company');--> statement-breakpoint
CREATE TABLE "asset_moves" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"asset_id" uuid NOT NULL,
	"from_kind" text NOT NULL,
	"from_id" uuid NOT NULL,
	"to_kind" text NOT NULL,
	"to_id" uuid NOT NULL,
	"moved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"moved_by" uuid,
	"reason" text DEFAULT '' NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"category" text DEFAULT '' NOT NULL,
	"value" integer DEFAULT 0 NOT NULL,
	"condition" text DEFAULT 'Tốt' NOT NULL,
	"location_kind" text NOT NULL,
	"location_id" uuid NOT NULL,
	"facility_id" uuid NOT NULL,
	"status" text DEFAULT 'in_use' NOT NULL,
	"search_text" text DEFAULT '' NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assets_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"entity_id" uuid,
	"facility_id" uuid,
	"before" jsonb,
	"after" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deposit_contracts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"room_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"deposit_amount" integer NOT NULL,
	"agreed_rent" integer NOT NULL,
	"expected_move_in" date NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"cancel_outcome" text,
	"sign_status" text DEFAULT 'draft' NOT NULL,
	"signed_file_id" uuid,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deposit_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lease_id" uuid,
	"deposit_contract_id" uuid,
	"date" date NOT NULL,
	"type" text NOT NULL,
	"amount" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"method" text,
	"note" text DEFAULT '' NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lease_fees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lease_id" uuid NOT NULL,
	"fee_type_id" uuid NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit_price" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lease_occupants" (
	"lease_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	CONSTRAINT "lease_occupants_lease_id_tenant_id_pk" PRIMARY KEY("lease_id","tenant_id")
);
--> statement-breakpoint
CREATE TABLE "leases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"room_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"monthly_rent" integer NOT NULL,
	"deposit_amount" integer NOT NULL,
	"due_rule" jsonb,
	"proration" text,
	"from_deposit_contract_id" uuid,
	"status" text DEFAULT 'active' NOT NULL,
	"sign_status" text DEFAULT 'draft' NOT NULL,
	"signed_file_id" uuid,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "leases_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "facilities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"address" text DEFAULT '' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"expected_invoice_day" integer DEFAULT 5 NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "facilities_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "rooms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"facility_id" uuid NOT NULL,
	"code" text NOT NULL,
	"floor" text,
	"room_type" text,
	"area_m2" numeric,
	"list_price" integer,
	"capacity" integer,
	"note" text DEFAULT '' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rooms_facility_code_unique" UNIQUE("facility_id","code")
);
--> statement-breakpoint
CREATE TABLE "fee_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"unit_id" uuid NOT NULL,
	"default_price" integer DEFAULT 0 NOT NULL,
	"billing" text DEFAULT 'monthly_fixed' NOT NULL,
	"quantity_from" text DEFAULT 'manual' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fee_units" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fee_units_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "utility_rates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"facility_id" uuid NOT NULL,
	"utility" text NOT NULL,
	"price_per_unit" integer NOT NULL,
	"effective_from" date NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "utility_rates_facility_utility_from_unique" UNIQUE("facility_id","utility","effective_from")
);
--> statement-breakpoint
CREATE TABLE "files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"storage_key" text NOT NULL,
	"thumb_key" text,
	"name" text DEFAULT '' NOT NULL,
	"content_type" text NOT NULL,
	"size" bigint DEFAULT 0 NOT NULL,
	"owner_type" text NOT NULL,
	"owner_id" uuid NOT NULL,
	"facility_id" uuid,
	"uploaded_by" uuid,
	"meta" jsonb,
	"confirmed_at" timestamp with time zone,
	"delete_after" date,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "doc_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"doc_type" text NOT NULL,
	"name" text NOT NULL,
	"file_id" uuid,
	"is_default" boolean DEFAULT false NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "tenant_kind" NOT NULL,
	"home_facility_id" uuid NOT NULL,
	"phone" text,
	"email" text,
	"note" text DEFAULT '' NOT NULL,
	"full_name" text,
	"nationality" text,
	"passport_number" text,
	"passport_expiry" date,
	"visa_type" text,
	"visa_expiry" date,
	"id_number" text,
	"id_issue_date" date,
	"id_issue_place" text,
	"date_of_birth" date,
	"permanent_address" text,
	"company_name" text,
	"tax_code" text,
	"company_address" text,
	"representative" text,
	"contact_person" text,
	"search_text" text DEFAULT '' NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenants_phone_unique" UNIQUE("phone"),
	CONSTRAINT "tenants_individual_required" CHECK ("tenants"."kind" = 'company' or ("tenants"."full_name" is not null and "tenants"."phone" is not null)),
	CONSTRAINT "tenants_company_required" CHECK ("tenants"."kind" <> 'company' or ("tenants"."company_name" is not null and "tenants"."tax_code" is not null)),
	CONSTRAINT "tenants_foreign_required" CHECK ("tenants"."kind" <> 'foreign' or "tenants"."passport_number" is not null),
	CONSTRAINT "tenants_vietnamese_required" CHECK ("tenants"."kind" <> 'vietnamese' or "tenants"."id_number" is not null)
);
--> statement-breakpoint
CREATE TABLE "user_facilities" (
	"user_id" uuid NOT NULL,
	"facility_id" uuid NOT NULL,
	CONSTRAINT "user_facilities_user_id_facility_id_pk" PRIMARY KEY("user_id","facility_id")
);
--> statement-breakpoint
CREATE TABLE "user_permissions" (
	"user_id" uuid NOT NULL,
	"permission" text NOT NULL,
	CONSTRAINT "user_permissions_user_id_permission_pk" PRIMARY KEY("user_id","permission"),
	CONSTRAINT "user_permissions_permission_check" CHECK ("user_permissions"."permission" in ('tenants_contracts','billing','meters','assets','incidents','settings'))
);
--> statement-breakpoint
CREATE TABLE "user_profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"full_name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_profiles_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "asset_moves" ADD CONSTRAINT "asset_moves_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_facility_id_facilities_id_fk" FOREIGN KEY ("facility_id") REFERENCES "public"."facilities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deposit_contracts" ADD CONSTRAINT "deposit_contracts_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deposit_contracts" ADD CONSTRAINT "deposit_contracts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deposit_entries" ADD CONSTRAINT "deposit_entries_lease_id_leases_id_fk" FOREIGN KEY ("lease_id") REFERENCES "public"."leases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deposit_entries" ADD CONSTRAINT "deposit_entries_deposit_contract_id_deposit_contracts_id_fk" FOREIGN KEY ("deposit_contract_id") REFERENCES "public"."deposit_contracts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lease_fees" ADD CONSTRAINT "lease_fees_lease_id_leases_id_fk" FOREIGN KEY ("lease_id") REFERENCES "public"."leases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lease_fees" ADD CONSTRAINT "lease_fees_fee_type_id_fee_types_id_fk" FOREIGN KEY ("fee_type_id") REFERENCES "public"."fee_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lease_occupants" ADD CONSTRAINT "lease_occupants_lease_id_leases_id_fk" FOREIGN KEY ("lease_id") REFERENCES "public"."leases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lease_occupants" ADD CONSTRAINT "lease_occupants_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leases" ADD CONSTRAINT "leases_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leases" ADD CONSTRAINT "leases_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leases" ADD CONSTRAINT "leases_from_deposit_contract_id_deposit_contracts_id_fk" FOREIGN KEY ("from_deposit_contract_id") REFERENCES "public"."deposit_contracts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_facility_id_facilities_id_fk" FOREIGN KEY ("facility_id") REFERENCES "public"."facilities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_types" ADD CONSTRAINT "fee_types_unit_id_fee_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."fee_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "utility_rates" ADD CONSTRAINT "utility_rates_facility_id_facilities_id_fk" FOREIGN KEY ("facility_id") REFERENCES "public"."facilities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_home_facility_id_facilities_id_fk" FOREIGN KEY ("home_facility_id") REFERENCES "public"."facilities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_facilities" ADD CONSTRAINT "user_facilities_user_id_user_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_facilities" ADD CONSTRAINT "user_facilities_facility_id_facilities_id_fk" FOREIGN KEY ("facility_id") REFERENCES "public"."facilities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_permissions" ADD CONSTRAINT "user_permissions_user_id_user_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "deposit_contracts_one_pending_per_room" ON "deposit_contracts" USING btree ("room_id") WHERE "deposit_contracts"."status" = 'pending';--> statement-breakpoint
CREATE UNIQUE INDEX "leases_one_active_per_room" ON "leases" USING btree ("room_id") WHERE "leases"."status" = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "tenants_passport_unique" ON "tenants" USING btree ("passport_number") WHERE "tenants"."kind" = 'foreign';--> statement-breakpoint
CREATE UNIQUE INDEX "tenants_id_number_unique" ON "tenants" USING btree ("id_number") WHERE "tenants"."kind" = 'vietnamese';--> statement-breakpoint
CREATE UNIQUE INDEX "tenants_tax_code_unique" ON "tenants" USING btree ("tax_code") WHERE "tenants"."kind" = 'company';