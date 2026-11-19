import { NewContract, type NewContractSP } from '../new-contract'

export default async function NewContractPage({ searchParams }: { searchParams: Promise<NewContractSP> }) {
  return <NewContract sp={await searchParams} />
}
