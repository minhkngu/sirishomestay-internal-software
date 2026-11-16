-- Bật RLS cho mọi bảng, không tạo policy: chặn mọi truy cập qua anon key / PostgREST.
-- Ứng dụng truy cập trực tiếp bằng kết nối Postgres (vai trò sở hữu bảng, bỏ qua RLS).
alter table "user_profiles" enable row level security;
--> statement-breakpoint
alter table "user_facilities" enable row level security;
--> statement-breakpoint
alter table "user_permissions" enable row level security;
--> statement-breakpoint
alter table "facilities" enable row level security;
--> statement-breakpoint
alter table "rooms" enable row level security;
--> statement-breakpoint
alter table "tenants" enable row level security;
--> statement-breakpoint
alter table "tenant_documents" enable row level security;
--> statement-breakpoint
alter table "app_settings" enable row level security;
--> statement-breakpoint
alter table "audit_logs" enable row level security;
