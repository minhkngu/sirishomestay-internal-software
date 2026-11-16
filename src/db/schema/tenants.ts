import { sql } from 'drizzle-orm'
import { boolean, check, date, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { facilities } from './facilities'

export const tenantKind = pgEnum('tenant_kind', ['foreign', 'vietnamese', 'company'])

export const tenants = pgTable(
  'tenants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    kind: tenantKind('kind').notNull(),
    homeFacilityId: uuid('home_facility_id').notNull().references(() => facilities.id),
    phone: text('phone').unique(),
    email: text('email'),
    note: text('note').notNull().default(''),
    fullName: text('full_name'),
    nationality: text('nationality'),
    passportNumber: text('passport_number'),
    passportExpiry: date('passport_expiry', { mode: 'string' }),
    visaType: text('visa_type'),
    visaExpiry: date('visa_expiry', { mode: 'string' }),
    idNumber: text('id_number'),
    idIssueDate: date('id_issue_date', { mode: 'string' }),
    idIssuePlace: text('id_issue_place'),
    dateOfBirth: date('date_of_birth', { mode: 'string' }),
    permanentAddress: text('permanent_address'),
    companyName: text('company_name'),
    taxCode: text('tax_code'),
    companyAddress: text('company_address'),
    representative: text('representative'),
    contactPerson: text('contact_person'),
    searchText: text('search_text').notNull().default(''),
    isDemo: boolean('is_demo').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('tenants_individual_required', sql`${t.kind} = 'company' or (${t.fullName} is not null and ${t.phone} is not null)`),
    check('tenants_company_required', sql`${t.kind} <> 'company' or (${t.companyName} is not null and ${t.taxCode} is not null)`),
    check('tenants_foreign_required', sql`${t.kind} <> 'foreign' or ${t.passportNumber} is not null`),
    check('tenants_vietnamese_required', sql`${t.kind} <> 'vietnamese' or ${t.idNumber} is not null`),
    uniqueIndex('tenants_passport_unique').on(t.passportNumber).where(sql`${t.kind} = 'foreign'`),
    uniqueIndex('tenants_id_number_unique').on(t.idNumber).where(sql`${t.kind} = 'vietnamese'`),
    uniqueIndex('tenants_tax_code_unique').on(t.taxCode).where(sql`${t.kind} = 'company'`),
  ],
)

