export function resolveSupabaseKey(anonKey: string | undefined, publishableKey: string | undefined): string {
  const key = anonKey || publishableKey
  if (!key) throw new Error('Thiếu khóa Supabase công khai')
  return key
}
