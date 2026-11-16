import { boolean, bigint, date, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

/** Mọi tệp (ảnh giấy tờ, ảnh bàn giao/sự cố, bản scan đã ký, mẫu Word, bản xuất) — nội dung nằm ở storage, bảng này giữ metadata + chủ sở hữu. */
export const files = pgTable('files', {
  id: uuid('id').primaryKey().defaultRandom(),
  storageKey: text('storage_key').notNull(),
  thumbKey: text('thumb_key'),
  name: text('name').notNull().default(''),
  contentType: text('content_type').notNull(),
  size: bigint('size', { mode: 'number' }).notNull().default(0),
  ownerType: text('owner_type').notNull(),
  ownerId: uuid('owner_id').notNull(),
  facilityId: uuid('facility_id'),
  uploadedBy: uuid('uploaded_by'),
  meta: jsonb('meta'),
  confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
  deleteAfter: date('delete_after', { mode: 'string' }),
  isDemo: boolean('is_demo').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})
