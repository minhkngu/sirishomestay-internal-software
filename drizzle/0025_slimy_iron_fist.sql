ALTER TABLE "addenda" ADD COLUMN "old_tenant_id" uuid;--> statement-breakpoint
ALTER TABLE "addenda" ADD COLUMN "new_tenant_id" uuid;--> statement-breakpoint
ALTER TABLE "addenda" ADD CONSTRAINT "addenda_old_tenant_id_tenants_id_fk" FOREIGN KEY ("old_tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "addenda" ADD CONSTRAINT "addenda_new_tenant_id_tenants_id_fk" FOREIGN KEY ("new_tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;