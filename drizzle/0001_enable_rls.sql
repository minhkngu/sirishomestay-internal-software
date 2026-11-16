-- Bật RLS cho mọi bảng, không tạo policy: chặn mọi truy cập qua anon key / PostgREST.
alter table "asset_moves" enable row level security;
--> statement-breakpoint
alter table "assets" enable row level security;
--> statement-breakpoint
alter table "audit_logs" enable row level security;
--> statement-breakpoint
alter table "deposit_contracts" enable row level security;
--> statement-breakpoint
alter table "deposit_entries" enable row level security;
--> statement-breakpoint
alter table "lease_fees" enable row level security;
--> statement-breakpoint
alter table "lease_occupants" enable row level security;
--> statement-breakpoint
alter table "leases" enable row level security;
--> statement-breakpoint
alter table "facilities" enable row level security;
--> statement-breakpoint
alter table "rooms" enable row level security;
--> statement-breakpoint
alter table "fee_types" enable row level security;
--> statement-breakpoint
alter table "fee_units" enable row level security;
--> statement-breakpoint
alter table "utility_rates" enable row level security;
--> statement-breakpoint
alter table "files" enable row level security;
--> statement-breakpoint
alter table "meter_readings" enable row level security;
--> statement-breakpoint
alter table "meters" enable row level security;
--> statement-breakpoint
alter table "app_settings" enable row level security;
--> statement-breakpoint
alter table "doc_templates" enable row level security;
--> statement-breakpoint
alter table "tenants" enable row level security;
--> statement-breakpoint
alter table "user_facilities" enable row level security;
--> statement-breakpoint
alter table "user_permissions" enable row level security;
--> statement-breakpoint
alter table "user_profiles" enable row level security;
