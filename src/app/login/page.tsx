'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Brain } from 'lucide-react'
import { sanitizeRedirectPath } from '@/lib/auth-redirect'

function LoginForm() {
  const router = useRouter()
  const params = useSearchParams()
  const next = sanitizeRedirectPath(params.get('next'))
  const [username, setUsername] = useState('waltter')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
        credentials: 'include',
      })
      const json = await res.json()
      if (!res.ok || json.error) {
        setError(json.error ?? 'Usuário ou senha incorretos')
        return
      }
      router.push(next)
      router.refresh()
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="w-full max-w-sm rounded-2xl border border-border/80 bg-panel/95 p-6 shadow-[0_20px_60px_rgba(0,0,0,0.35)]">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-brass/30 bg-brass/10 text-brass">
          <Brain size={20} />
        </div>
        <div>
          <p className="font-display text-xl tracking-tight">Cérebro</p>
          <p className="text-xs text-muted">Acesso Waltter</p>
        </div>
      </div>

      <h1 className="mt-6 font-display text-2xl tracking-tight">Entrar no comando</h1>
      <p className="mt-1 text-sm text-muted">Painel consolidado ROM Brasil + Iguatemi.</p>

      <form onSubmit={submit} className="mt-6 flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-[0.65rem] uppercase tracking-[0.18em] text-muted">Usuário</span>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            autoComplete="username"
            autoFocus
            className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-base outline-none focus:border-brass"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[0.65rem] uppercase tracking-[0.18em] text-muted">Senha</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-base outline-none focus:border-brass"
          />
        </label>
        {error && <p className="text-sm text-danger">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="rounded-xl bg-brass px-4 py-3 text-sm font-medium text-background transition hover:bg-brass-soft disabled:opacity-60"
        >
          {loading ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </div>
  )
}

export default function LoginPage() {
  return (
    <main className="relative flex min-h-dvh w-full items-center justify-center overflow-hidden bg-background px-5 py-8">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(201,164,92,0.14),_transparent_55%),radial-gradient(ellipse_at_bottom_right,_rgba(111,175,160,0.10),_transparent_50%)]"
      />
      <Suspense fallback={<div className="h-72 w-full max-w-sm animate-pulse rounded-2xl bg-panel" />}>
        <LoginForm />
      </Suspense>
    </main>
  )
}
