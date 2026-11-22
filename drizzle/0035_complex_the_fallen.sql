ALTER TABLE "meters" ADD COLUMN "code" text;--> statement-breakpoint
ALTER TABLE "meters" ADD CONSTRAINT "meters_code_unique" UNIQUE("code");