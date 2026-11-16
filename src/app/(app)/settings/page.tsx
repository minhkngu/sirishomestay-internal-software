import { notFound } from 'next/navigation'
import { db } from '@/db/client'
import { getAccessContext } from '@/lib/session'
import { getSettings } from '@/features/settings/service'
import { SettingsForm } from '@/features/settings/settings-form'

export default async function SettingsPage() {
  const ctx = await getAccessContext()
  if (!ctx.isAdmin) notFound()
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Cài đặt</h1>
      <SettingsForm initial={await getSettings(db)} />
    </div>
  )
}
