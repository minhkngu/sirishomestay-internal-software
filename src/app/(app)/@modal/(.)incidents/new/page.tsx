import { RouteModal } from '@/components/route-modal'
import { NewIncident, type NewIncidentSP } from '../../../incidents/new-incident'

export default async function InterceptedNewIncident({ searchParams }: { searchParams: Promise<NewIncidentSP> }) {
  return <RouteModal title="Báo sự cố" size="md"><NewIncident sp={await searchParams} showHeading={false} /></RouteModal>
}
