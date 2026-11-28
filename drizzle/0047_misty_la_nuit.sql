DROP INDEX "tenant_wallet_entries_tenant_idx";--> statement-breakpoint
CREATE INDEX "tenant_wallet_entries_tenant_idx" ON "tenant_wallet_entries" USING btree ("tenant_id");