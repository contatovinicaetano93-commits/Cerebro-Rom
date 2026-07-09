'use client'

import { useRouter } from 'next/navigation'
import { LogOut } from 'lucide-react'
import { useState } from 'react'

export function LogoutButton() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function logout() {
    setLoading(true)
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
      router.push('/login')
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      type="button"
      onClick={logout}
      disabled={loading}
      className="inline-flex items-center gap-1.5 rounded-full border border-border/70 px-3 py-1 text-[0.65rem] uppercase tracking-wider text-muted transition hover:border-brass/40 hover:text-brass disabled:opacity-50"
    >
      <LogOut size={12} />
      {loading ? 'Saindo…' : 'Sair'}
    </button>
  )
}
