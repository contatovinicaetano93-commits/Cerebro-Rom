import { describe, expect, it } from 'vitest'
import { isRomNovosLead } from '@/lib/live/rom-leads'

describe('isRomNovosLead (paridade Contatos Novos)', () => {
  it('aceita lead Avec do dia sem avec_client_id', () => {
    expect(
      isRomNovosLead({
        channel: 'avec',
        avec_client_id: null,
        status: 'novo',
        source: 'avec_webhook_appointment',
      }),
    ).toBe(true)
  })

  it('rejeita importado e cliente já vinculado', () => {
    expect(
      isRomNovosLead({
        channel: 'avec',
        avec_client_id: '123',
        status: 'novo',
        source: null,
      }),
    ).toBe(false)
    expect(
      isRomNovosLead({
        channel: 'avec',
        avec_client_id: null,
        status: 'importado',
        source: null,
      }),
    ).toBe(false)
  })

  it('rejeita dump em massa mas não webhook operacional', () => {
    expect(
      isRomNovosLead({
        channel: 'avec',
        avec_client_id: null,
        status: 'novo',
        source: 'avec_sync_clients',
      }),
    ).toBe(false)
    expect(
      isRomNovosLead({
        channel: 'avec',
        avec_client_id: null,
        status: 'novo',
        source: 'avec_backfill_2024',
      }),
    ).toBe(false)
    expect(
      isRomNovosLead({
        channel: 'avec',
        avec_client_id: null,
        status: 'novo',
        source: 'avec_lake_import',
      }),
    ).toBe(false)
    expect(
      isRomNovosLead({
        channel: 'whatsapp',
        avec_client_id: null,
        status: 'novo',
        source: 'inbound',
      }),
    ).toBe(false)
  })
})
