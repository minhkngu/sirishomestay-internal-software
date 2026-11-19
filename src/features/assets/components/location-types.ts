export type TreeFacility = { id: string; name: string; rooms: { id: string; code: string }[] }
export type Selected = { kind: 'all' } | { kind: 'warehouse' | 'common' | 'unassigned'; id: string } | { kind: 'room'; id: string } | { kind: 'facility'; id: string }
