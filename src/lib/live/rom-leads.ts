/** Shape mínimo de `contacts` para o filtro de leads ROM (paridade Contatos Novos). */
export type RomLeadContact = {
  channel: string
  avec_client_id: string | null
  status: string
  source: string | null
}

/**
 * Lead Avec do dia sem cliente cadastrado na Avec ainda — paridade ROM Contatos Novos.
 * Exclui só dump em massa (clients/backfill/lake), não webhook/agenda operacional.
 */
export function isRomNovosLead(c: RomLeadContact): boolean {
  if (c.status === 'importado') return false
  if (c.channel !== 'avec') return false
  if (c.avec_client_id != null && String(c.avec_client_id).trim() !== '') return false
  const src = c.source ?? ''
  if (src.startsWith('avec_sync_clients')) return false
  if (src.startsWith('avec_backfill')) return false
  if (src.startsWith('avec_lake')) return false
  return true
}
