import { boolean, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

export const docTemplates = pgTable('doc_templates', {
  id: uuid('id').primaryKey().defaultRandom(),
  docType: text('doc_type').notNull(),
  name: text('name').notNull(),
  fileId: uuid('file_id'),
  /** Nội dung mẫu soạn trong app (HTML); mẫu chỉ có `fileId` là mẫu Word cũ, không còn dùng được. */
  body: text('body'),
  /** Kiểu trình bày khi xuất: 'formal' (Trang trọng) hoặc 'modern' (Hiện đại). */
  style: text('style').notNull().default('formal'),
  isDefault: boolean('is_default').notNull().default(false),
  isDemo: boolean('is_demo').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const invoiceTemplates = pgTable('invoice_templates', {
  id: uuid('id').primaryKey().defaultRandom(), name: text('name').notNull(), config: jsonb('config').notNull(),
  isDefault: boolean('is_default').notNull().default(false), isSystem: boolean('is_system').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(), updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [uniqueIndex('invoice_templates_one_default').on(t.isDefault).where(sql`${t.isDefault}`)]).enableRLS()
