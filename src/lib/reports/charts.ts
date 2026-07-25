import { createWriteStream } from 'node:fs'
import { mkdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { PassThrough } from 'node:stream'
import * as PImage from 'pureimage'
import type { CerebroOverview } from '@/lib/types'
import { unitMtdKpis } from '@/lib/reports/mtd-kpis'

const W = 920
const H = 420
const PAD = { t: 48, r: 28, b: 56, l: 72 }

type Bitmap = ReturnType<typeof PImage.make>
type Ctx = ReturnType<Bitmap['getContext']>

let fontsReady: Promise<void> | null = null

function fontDir(): string {
  return path.join(process.cwd(), 'src/lib/reports/fonts')
}

async function ensureFonts(): Promise<void> {
  if (!fontsReady) {
    fontsReady = (async () => {
      const dir = fontDir()
      const regular = path.join(dir, 'DejaVuSans.ttf')
      const bold = path.join(dir, 'DejaVuSans-Bold.ttf')
      PImage.registerFont(regular, 'DejaVu').loadSync()
      PImage.registerFont(bold, 'DejaVuBold').loadSync()
    })()
  }
  await fontsReady
}

async function bitmapToPngBuffer(img: Bitmap): Promise<Buffer> {
  const chunks: Buffer[] = []
  const stream = new PassThrough()
  stream.on('data', (c: Buffer) => chunks.push(c))
  const done = new Promise<void>((resolve, reject) => {
    stream.on('end', () => resolve())
    stream.on('error', reject)
  })
  await PImage.encodePNGToStream(img, stream)
  await done
  return Buffer.concat(chunks)
}

function fill(ctx: Ctx, color: string, x: number, y: number, w: number, h: number) {
  ctx.fillStyle = color
  ctx.fillRect(x, y, w, h)
}

function drawText(
  ctx: Ctx,
  text: string,
  x: number,
  y: number,
  opts?: { size?: number; color?: string; font?: string; align?: 'left' | 'right' | 'center' },
) {
  ctx.fillStyle = opts?.color ?? '#1a1a1a'
  ctx.font = `${opts?.size ?? 13}pt '${opts?.font ?? 'DejaVu'}'`
  ctx.textAlign = opts?.align ?? 'left'
  ctx.fillText(text, x, y)
}

function niceMax(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 1
  const pow = 10 ** Math.floor(Math.log10(value))
  const n = value / pow
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10
  return step * pow
}

function formatCompact(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(0)}k`
  return String(Math.round(n))
}

/** Linha: receita diária Brasil × Iguatemi (trend30). */
export async function renderRevenueTrendPng(overview: CerebroOverview): Promise<Buffer> {
  await ensureFonts()
  const img = PImage.make(W, H)
  const ctx = img.getContext('2d')
  fill(ctx, '#FFFDF8', 0, 0, W, H)

  const points = overview.trend30 ?? []
  drawText(ctx, 'Receita diária — Brasil × Iguatemi', PAD.l, 28, {
    size: 16,
    font: 'DejaVuBold',
    color: '#2A2118',
  })
  drawText(ctx, overview.periodLabel, PAD.l, 46, { size: 11, color: '#7A6A55' })

  const plotW = W - PAD.l - PAD.r
  const plotH = H - PAD.t - PAD.b
  fill(ctx, '#FFFFFF', PAD.l, PAD.t, plotW, plotH)
  ctx.strokeStyle = '#E8DCC8'
  ctx.lineWidth = 1
  ctx.strokeRect(PAD.l, PAD.t, plotW, plotH)

  if (points.length === 0) {
    drawText(ctx, 'Sem série diária no snapshot', PAD.l + 16, PAD.t + 40, {
      size: 13,
      color: '#8A7A66',
    })
    return bitmapToPngBuffer(img)
  }

  const maxY = niceMax(Math.max(...points.flatMap((p) => [p.brasil, p.iguatemi]), 1))
  const grid = 4
  for (let i = 0; i <= grid; i++) {
    const y = PAD.t + (plotH * i) / grid
    ctx.strokeStyle = '#F0E6D6'
    ctx.beginPath()
    ctx.moveTo(PAD.l, y)
    ctx.lineTo(PAD.l + plotW, y)
    ctx.stroke()
    const val = maxY * (1 - i / grid)
    drawText(ctx, formatCompact(val), PAD.l - 8, y + 4, {
      size: 10,
      color: '#8A7A66',
      align: 'right',
    })
  }

  const xAt = (i: number) =>
    PAD.l + (points.length === 1 ? plotW / 2 : (plotW * i) / (points.length - 1))
  const yAt = (v: number) => PAD.t + plotH * (1 - v / maxY)

  function strokeSeries(key: 'brasil' | 'iguatemi', color: string) {
    ctx.strokeStyle = color
    ctx.lineWidth = 2.5
    ctx.beginPath()
    points.forEach((p, i) => {
      const x = xAt(i)
      const y = yAt(p[key] ?? 0)
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    })
    ctx.stroke()
    for (let i = 0; i < points.length; i++) {
      const x = xAt(i)
      const y = yAt(points[i]![key] ?? 0)
      fill(ctx, color, x - 2.5, y - 2.5, 5, 5)
    }
  }

  strokeSeries('brasil', '#C4A35A')
  strokeSeries('iguatemi', '#3D6B8A')

  // x labels (sparse)
  const step = Math.max(1, Math.ceil(points.length / 8))
  for (let i = 0; i < points.length; i += step) {
    drawText(ctx, points[i]!.day, xAt(i), H - 28, {
      size: 10,
      color: '#8A7A66',
      align: 'center',
    })
  }

  // legend
  fill(ctx, '#C4A35A', W - 220, 18, 12, 12)
  drawText(ctx, 'Brasil', W - 200, 29, { size: 11, color: '#2A2118' })
  fill(ctx, '#3D6B8A', W - 130, 18, 12, 12)
  drawText(ctx, 'Iguatemi', W - 110, 29, { size: 11, color: '#2A2118' })

  return bitmapToPngBuffer(img)
}

/** Barras: KPIs MTD principais Brasil × Iguatemi (valores normalizados por série). */
export async function renderMtdBarsPng(overview: CerebroOverview): Promise<Buffer> {
  await ensureFonts()
  const img = PImage.make(W, H)
  const ctx = img.getContext('2d')
  fill(ctx, '#FFFDF8', 0, 0, W, H)

  drawText(ctx, 'KPIs MTD — Brasil × Iguatemi', PAD.l, 28, {
    size: 16,
    font: 'DejaVuBold',
    color: '#2A2118',
  })
  drawText(ctx, 'Barras por indicador (escala própria em cada grupo)', PAD.l, 46, {
    size: 11,
    color: '#7A6A55',
  })

  const br = overview.units.find((u) => u.unit.slug === 'rom-brasil')
  const ig = overview.units.find((u) => u.unit.slug === 'rom-iguatemi')
  const b = br ? unitMtdKpis(br) : null
  const i = ig ? unitMtdKpis(ig) : null

  const series: { label: string; brasil: number; iguatemi: number; kind: 'money' | 'count' | 'pct' }[] =
    [
      { label: 'Receita', brasil: b?.revenue ?? 0, iguatemi: i?.revenue ?? 0, kind: 'money' },
      {
        label: 'Atendidos',
        brasil: b?.attended ?? 0,
        iguatemi: i?.attended ?? 0,
        kind: 'count',
      },
      {
        label: 'Cancel.',
        brasil: b?.cancelled ?? 0,
        iguatemi: i?.cancelled ?? 0,
        kind: 'count',
      },
      {
        label: 'Ticket',
        brasil: b?.ticketAvg ?? 0,
        iguatemi: i?.ticketAvg ?? 0,
        kind: 'money',
      },
      {
        label: 'Ocupação',
        brasil: (b?.occupancyRate ?? 0) * 100,
        iguatemi: (i?.occupancyRate ?? 0) * 100,
        kind: 'pct',
      },
    ]

  const plotW = W - PAD.l - PAD.r
  const plotH = H - PAD.t - PAD.b
  fill(ctx, '#FFFFFF', PAD.l, PAD.t, plotW, plotH)
  ctx.strokeStyle = '#E8DCC8'
  ctx.strokeRect(PAD.l, PAD.t, plotW, plotH)

  const groupW = plotW / series.length
  const barW = Math.min(28, groupW * 0.28)

  series.forEach((s, idx) => {
    const max = niceMax(Math.max(s.brasil, s.iguatemi, 0.0001))
    const cx = PAD.l + groupW * idx + groupW / 2
    const hBr = (plotH * s.brasil) / max
    const hIg = (plotH * s.iguatemi) / max
    fill(ctx, '#C4A35A', cx - barW - 4, PAD.t + plotH - hBr, barW, hBr)
    fill(ctx, '#3D6B8A', cx + 4, PAD.t + plotH - hIg, barW, hIg)
    drawText(ctx, s.label, cx, H - 30, { size: 11, color: '#2A2118', align: 'center' })

    const fmt = (v: number) => {
      if (s.kind === 'money') return formatCompact(v)
      if (s.kind === 'pct') return `${v.toFixed(1)}%`
      return formatCompact(v)
    }
    drawText(ctx, fmt(s.brasil), cx - barW / 2 - 4, PAD.t + plotH - hBr - 6, {
      size: 9,
      color: '#8A6A20',
      align: 'center',
    })
    drawText(ctx, fmt(s.iguatemi), cx + barW / 2 + 4, PAD.t + plotH - hIg - 6, {
      size: 9,
      color: '#2F5570',
      align: 'center',
    })
  })

  fill(ctx, '#C4A35A', W - 220, 18, 12, 12)
  drawText(ctx, 'Brasil', W - 200, 29, { size: 11, color: '#2A2118' })
  fill(ctx, '#3D6B8A', W - 130, 18, 12, 12)
  drawText(ctx, 'Iguatemi', W - 110, 29, { size: 11, color: '#2A2118' })

  return bitmapToPngBuffer(img)
}

/** Dev helper — writes PNGs under /tmp for smoke checks. */
export async function debugWriteCharts(overview: CerebroOverview, dir = '/tmp/cerebro-charts') {
  await mkdir(dir, { recursive: true })
  const [line, bars] = await Promise.all([
    renderRevenueTrendPng(overview),
    renderMtdBarsPng(overview),
  ])
  await Promise.all([
    new Promise<void>((res, rej) => {
      const s = createWriteStream(path.join(dir, 'trend.png'))
      s.on('finish', () => res())
      s.on('error', rej)
      s.end(line)
    }),
    new Promise<void>((res, rej) => {
      const s = createWriteStream(path.join(dir, 'bars.png'))
      s.on('finish', () => res())
      s.on('error', rej)
      s.end(bars)
    }),
  ])
  // touch fonts exist
  await readFile(path.join(fontDir(), 'DejaVuSans.ttf'))
  return dir
}
