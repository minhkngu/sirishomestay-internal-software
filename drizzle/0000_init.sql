CREATE TYPE "public"."tenant_kind" AS ENUM('foreign', 'vietnamese', 'company');--> statement-breakpoint
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
CREATE TABLE "app_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenant_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"storage_key" text NOT NULL,
	"thumb_key" text NOT NULL,
	"content_type" text NOT NULL,
	"label" text DEFAULT '' NOT NULL,
	"uploaded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
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
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_facility_id_facilities_id_fk" FOREIGN KEY ("facility_id") REFERENCES "public"."facilities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fee_types" ADD CONSTRAINT "fee_types_unit_id_fee_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."fee_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "utility_rates" ADD CONSTRAINT "utility_rates_facility_id_facilities_id_fk" FOREIGN KEY ("facility_id") REFERENCES "public"."facilities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_documents" ADD CONSTRAINT "tenant_documents_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_home_facility_id_facilities_id_fk" FOREIGN KEY ("home_facility_id") REFERENCES "public"."facilities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_facilities" ADD CONSTRAINT "user_facilities_user_id_user_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_facilities" ADD CONSTRAINT "user_facilities_facility_id_facilities_id_fk" FOREIGN KEY ("facility_id") REFERENCES "public"."facilities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_permissions" ADD CONSTRAINT "user_permissions_user_id_user_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "tenants_passport_unique" ON "tenants" USING btree ("passport_number") WHERE "tenants"."kind" = 'foreign';--> statement-breakpoint
CREATE UNIQUE INDEX "tenants_id_number_unique" ON "tenants" USING btree ("id_number") WHERE "tenants"."kind" = 'vietnamese';--> statement-breakpoint
CREATE UNIQUE INDEX "tenants_tax_code_unique" ON "tenants" USING btree ("tax_code") WHERE "tenants"."kind" = 'company';