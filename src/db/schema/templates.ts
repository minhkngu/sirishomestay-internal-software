import { boolean, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

export const docTemplates = pgTable('doc_templates', {
  id: uuid('id').primaryKey().defaultRandom(),
  docType: text('doc_type').notNull(),
  name: text('name').notNull(),
  fileId: uuid('file_id'),
  isDefault: boolean('is_default').notNull().default(false),
  isDemo: boolean('is_demo').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})
