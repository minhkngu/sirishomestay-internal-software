import { NewIncident, type NewIncidentSP } from '../new-incident'

export default async function NewIncidentPage({ searchParams }: { searchParams: Promise<NewIncidentSP> }) {
  return <NewIncident sp={await searchParams} />
}
