ALTER TABLE "leases" ADD COLUMN "legacy_code" text;--> statement-breakpoint
ALTER TABLE "leases" ADD CONSTRAINT "leases_legacy_code_unique" UNIQUE("legacy_code");