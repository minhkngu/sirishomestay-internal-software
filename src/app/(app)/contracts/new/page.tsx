import { redirect } from 'next/navigation'
import type { NewContractSP } from '../new-contract'

/** Mở thẳng /contracts/new cũng chỉ mở popup trên danh sách, không dựng trang riêng. */
export default async function NewContractPage({ searchParams }: { searchParams: Promise<NewContractSP> }) {
  const sp = await searchParams
  const params = new URLSearchParams()
  params.set('new', sp.kind === 'deposit' ? 'deposit' : 'lease')
  for (const key of ['kind', 'room', 'tenant', 'deposit'] as const) {
    const value = sp[key]
    if (value) params.set(key, value)
  }
  redirect(`/contracts?${params.toString()}`)
}
