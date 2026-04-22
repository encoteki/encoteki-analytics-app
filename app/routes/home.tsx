import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import { createPortal } from "react-dom"
import type { Route } from "./+types/home"
import { ArrowRight, ArrowLeft, Search, X, RefreshCw, ExternalLink } from "lucide-react"

import {
  APP_ENV,
  BASE_RPC_URL,
  CHAIN_IDS,
  CHAIN_TOKENS,
  CHAIN_META,
  MINT_PRICES,
  TOKEN_ICONS,
  TSB_CONTRACTS,
  EXPLORER_TOKEN_URLS,
  chainKeyById,
  tokenSymbolByAddress,
  type ChainKey,
  type TokenSymbol,
} from "~/config"
import { fetchAllMints, STATUS_CONFIRMED, type MintItem } from "~/lib/graphql"
import { fetchMaxSupply } from "~/lib/rpc"

// ── HeatmapCell: custom cell with bold hover tooltip ──────────
interface HeatmapCellProps {
  count: number
  dateKey: string
  isFuture: boolean
  isToday: boolean
  cellBg: string
}

function HeatmapCell({ count, dateKey, isFuture, isToday, cellBg }: HeatmapCellProps) {
  const [showTooltip, setShowTooltip] = useState(false)
  const [positionBelow, setPositionBelow] = useState(false)
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 })
  const cellRef = useRef<HTMLDivElement>(null)

  const dateLabel = new Date(dateKey).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  })

  const handleMouseEnter = () => {
    if (isFuture) return
    if (cellRef.current) {
      const rect = cellRef.current.getBoundingClientRect()
      const spaceAbove = rect.top
      const shouldBelow = spaceAbove < 90
      setPositionBelow(shouldBelow)
      setTooltipPos({
        x: rect.left + rect.width / 2,
        y: shouldBelow ? rect.bottom + 8 : rect.top - 8,
      })
    }
    setShowTooltip(true)
  }

  return (
    <>
      <div
        ref={cellRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={() => setShowTooltip(false)}
        onFocus={handleMouseEnter}
        onBlur={() => setShowTooltip(false)}
        tabIndex={isFuture ? -1 : 0}
        style={{
          aspectRatio: "1",
          backgroundColor: cellBg,
          outline: isToday ? "2px solid #0F0F0F" : "none",
          outlineOffset: "1px",
        }}
        className="w-full cursor-default hover:brightness-90 focus-visible:brightness-75 transition-[filter]"
        aria-label={
          isFuture ? undefined : `${dateLabel}: ${count} mint${count !== 1 ? "s" : ""}`
        }
      />
      {showTooltip &&
        !isFuture &&
        createPortal(
          <div
            className="fixed z-9999 pointer-events-none"
            style={{
              left: `${tooltipPos.x}px`,
              top: positionBelow ? `${tooltipPos.y}px` : "auto",
              bottom: !positionBelow
                ? `${window.innerHeight - tooltipPos.y}px`
                : "auto",
              transform: "translateX(-50%)",
            }}
          >
            <div className="bg-ink text-white px-3 py-2 rounded whitespace-nowrap shadow-2xl">
              <div className="text-xs font-black uppercase tracking-wider opacity-70">
                {dateLabel}
              </div>
              <div className="text-base md:text-lg font-black tracking-tight mt-1">
                {count.toLocaleString()} MINT{count !== 1 ? "S" : ""}
              </div>
            </div>
            <div
              className={`absolute left-1/2 -translate-x-1/2 w-0 h-0 ${
                positionBelow
                  ? "bottom-full border-l-3 border-r-3 border-b-3 border-l-transparent border-r-transparent border-b-ink"
                  : "top-full border-l-3 border-r-3 border-t-3 border-l-transparent border-r-transparent border-t-ink"
              }`}
            />
          </div>,
          document.body
        )}
    </>
  )
}

// ── Meta ─────────────────────────────────────────────────────
export function meta(_args: Route.MetaArgs) {
  return [
    { title: "Analytics — Encoteki" },
    {
      name: "Encoteki Analytics",
      content: "Encoteki cross-chain minting dashboard",
    },
  ]
}

// ── Types ────────────────────────────────────────────────────
interface TokenRevenue {
  symbol: TokenSymbol
  amount: number // count * mint price
  count: number
}

interface ChainStats {
  mintCount: number // confirmed mints (status == 3) for this chain
  revenue: TokenRevenue[]
}

// ── Helpers ──────────────────────────────────────────────────
const CHAIN_KEYS: ChainKey[] = ["base", "arbitrum", "lisk", "manta"]
const GMT7_OFFSET_MS = 7 * 60 * 60 * 1000

function formatAmount(amount: number, symbol: TokenSymbol): string {
  if (symbol === "ETH") return amount.toFixed(4)
  if (symbol === "IDRX")
    return new Intl.NumberFormat("en-US").format(Math.round(amount))
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(amount)
}

function shortAddress(address: string): string {
  if (address.length < 10) return address
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

function formatMintDate(mintDate?: string): string {
  if (!mintDate) return "—"
  const d = new Date(mintDate)
  if (!Number.isFinite(d.getTime())) return "—"
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
}

function statusLabel(status: string): "CONFIRMED" | "PENDING" | "FAILED" {
  const n = Number(status)
  if (n === 3) return "CONFIRMED"
  if (n === 2) return "PENDING"
  return "FAILED"
}

/**
 * Derive all per-chain and per-token stats from a flat list of mints.
 * Eliminates N+M additional GraphQL requests — everything is in fetchAllMints().
 */
function deriveChainStats(allMints: MintItem[]): Record<ChainKey, ChainStats> {
  // Build a map: chainId → paymentToken (lowercase) → count
  const chainTokenCounts = new Map<number, Map<string, number>>()

  for (const mint of allMints) {
    if (Number(mint.status) !== STATUS_CONFIRMED) continue
    const cid = Number(mint.chainId)
    if (!chainTokenCounts.has(cid)) chainTokenCounts.set(cid, new Map())
    const tokenMap = chainTokenCounts.get(cid)!
    const addr = mint.paymentToken.toLowerCase()
    tokenMap.set(addr, (tokenMap.get(addr) ?? 0) + 1)
  }

  const result = {} as Record<ChainKey, ChainStats>

  for (const key of CHAIN_KEYS) {
    const chainId = CHAIN_IDS[key]
    const tokenMap = chainTokenCounts.get(chainId) ?? new Map<string, number>()

    // Total confirmed mints for this chain
    let mintCount = 0
    for (const count of tokenMap.values()) mintCount += count

    // Per-token revenue — only tokens with activity
    const revenue: TokenRevenue[] = CHAIN_TOKENS[key]
      .map(({ symbol, address }) => {
        const count = tokenMap.get(address.toLowerCase()) ?? 0
        return {
          symbol,
          count,
          amount: count * MINT_PRICES[symbol],
        } satisfies TokenRevenue
      })
      .filter((r) => r.count > 0)

    result[key] = { mintCount, revenue }
  }

  return result
}

/**
 * Derive a map of { "YYYY-MM-DD" → count } from confirmed mints.
 * Uses mintDate (ISO 8601 with offset, e.g. "2026-04-20T03:46:59.000+07:00").
 * Day boundaries follow GMT+7 (00:00–23:59 WIB).
 */
function deriveDailyMintCounts(allMints: MintItem[]): Map<string, number> {
  const map = new Map<string, number>()
  for (const mint of allMints) {
    if (Number(mint.status) !== STATUS_CONFIRMED) continue
    if (!mint.mintDate) continue
    const d = new Date(mint.mintDate)
    if (!Number.isFinite(d.getTime())) continue
    const gmt7Date = new Date(d.getTime() + GMT7_OFFSET_MS)
    const key = gmt7Date.toISOString().slice(0, 10)
    map.set(key, (map.get(key) ?? 0) + 1)
  }
  return map
}

/** Format "YYYY-MM-DD" → e.g. "Apr 20" */
function formatDayLabel(key: string): string {
  const [y, m, d] = key.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  })
}

const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
]

/** Compute a current consecutive-day streak (working backwards from today in GMT+7). */
function computeStreak(dailyCounts: Map<string, number>): number {
  const todayGmt7 = new Date(Date.now() + GMT7_OFFSET_MS)
  todayGmt7.setUTCHours(0, 0, 0, 0)
  let streak = 0
  for (let i = 0; i < 365; i++) {
    const d = new Date(todayGmt7)
    d.setUTCDate(todayGmt7.getUTCDate() - i)
    const key = d.toISOString().slice(0, 10)
    if ((dailyCounts.get(key) ?? 0) > 0) {
      streak++
    } else if (i > 0) {
      break // gap found
    }
    // i === 0 and no mints today: continue checking yesterday
  }
  return streak
}

interface HeatmapProps {
  dailyCounts: Map<string, number>
  loading: boolean
}

function MintHeatmap({ dailyCounts, loading }: HeatmapProps) {
  const WEEKS = 53
  // "Today" in GMT+7: shift UTC clock forward 7 h, then zero to midnight
  const today = new Date(Date.now() + GMT7_OFFSET_MS)
  today.setUTCHours(0, 0, 0, 0)
  const todayKey = today.toISOString().slice(0, 10)
  const todayDay = today.getUTCDay() // 0=Sun … 6=Sat

  // Start from Sunday of the week that is (WEEKS-1) weeks before this week's Sunday
  const startDate = new Date(today)
  startDate.setUTCDate(today.getUTCDate() - todayDay - (WEEKS - 1) * 7)

  // Max for relative intensity
  let maxCount = 1
  for (const v of dailyCounts.values()) if (v > maxCount) maxCount = v

  // cols[w][d]: week w, weekday d
  type Cell = {
    key: string
    count: number
    isToday: boolean
    isFuture: boolean
  }
  const cols: Cell[][] = []
  for (let w = 0; w < WEEKS; w++) {
    const week: Cell[] = []
    for (let d = 0; d < 7; d++) {
      const cell = new Date(startDate)
      cell.setUTCDate(startDate.getUTCDate() + w * 7 + d)
      const key = cell.toISOString().slice(0, 10)
      week.push({
        key,
        count: dailyCounts.get(key) ?? 0,
        isToday: key === todayKey,
        isFuture: cell > today,
      })
    }
    cols.push(week)
  }

  // Month label: first column where the month changes
  const monthLabels: { col: number; label: string }[] = []
  let lastMonth = -1
  for (let w = 0; w < WEEKS; w++) {
    const month = Number(cols[w][0].key.slice(5, 7)) - 1
    if (month !== lastMonth) {
      monthLabels.push({ col: w, label: MONTH_NAMES[month] })
      lastMonth = month
    }
  }

  // Derive summary stats
  const totalMints = Array.from(dailyCounts.values()).reduce((a, b) => a + b, 0)
  const hasData = totalMints > 0
  const activeDays = dailyCounts.size

  let peakKey = ""
  let peakCount = 0
  for (const [k, v] of dailyCounts) {
    if (v > peakCount) {
      peakCount = v
      peakKey = k
    }
  }

  // This week's count (Sun → today)
  let thisWeek = 0
  for (let d = 0; d <= todayDay; d++) {
    const dt = new Date(today)
    dt.setUTCDate(today.getUTCDate() - todayDay + d)
    thisWeek += dailyCounts.get(dt.toISOString().slice(0, 10)) ?? 0
  }

  const streak = hasData ? computeStreak(dailyCounts) : 0

  // GitHub-style green scale, warm-tinted to sit on the #EFECE6 palette
  function cellBg(count: number, isFuture: boolean): string {
    if (isFuture) return "transparent"
    if (count === 0) return "#D6E8D3"
    const ratio = count / maxCount
    if (ratio < 0.2) return "#9BE9A8"
    if (ratio < 0.45) return "#40C463"
    if (ratio < 0.75) return "#30A14E"
    return "#216E39"
  }

  const GREEN_SCALE = ["#D6E8D3", "#9BE9A8", "#40C463", "#30A14E", "#216E39"] as const
  // Shared grid: 28px day-label col + 53 week cols; minmax keeps cells ≥11px so
  // mobile shows ~11px cells (scrollable) while desktop expands them to fill width.
  // Minimum grid width: 28 + 53*11 + 52*3 = 767px — used as the scroll container's min-width.
  const gridCols = `28px repeat(${WEEKS}, minmax(11px, 1fr))`
  const gridGap = "3px"

  return (
    <section className="border-b-4 border-ink">
      {/* ── Header bar ─────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] border-b-4 border-ink">
        <div className="p-6 md:p-8 lg:p-10 bg-paper-mid">
          <h2 className="text-3xl md:text-5xl font-black uppercase tracking-tight leading-none">
            DAILY ACTIVITY
          </h2>
          <p className="text-xs font-bold text-ink-muted mt-3 tracking-wide">
            Confirmed mints per day · last 12 months · all chains combined
          </p>
        </div>

        {hasData && !loading && (
          <div className="grid grid-cols-2 md:grid-cols-1 md:w-56 divide-x-4 md:divide-x-0 md:divide-y-4 divide-ink border-t-4 md:border-t-0 md:border-l-4 border-ink">
            <div className="p-4 md:p-6 bg-ink text-paper-mid flex flex-col justify-between min-h-20">
              <span className="text-[9px] font-black uppercase tracking-[0.2em] opacity-50">
                THIS WEEK
              </span>
              <span className="text-3xl md:text-4xl font-black tracking-tighter leading-none mt-2">
                {thisWeek.toLocaleString()}
              </span>
            </div>
            <div className="p-4 md:p-6 bg-paper-mid flex flex-col justify-between min-h-20">
              <span className="text-[9px] font-black uppercase tracking-[0.2em] text-ink-muted">
                STREAK
              </span>
              <span className="text-3xl md:text-4xl font-black tracking-tighter leading-none mt-2">
                {streak}
                <span className="text-xs font-bold uppercase tracking-widest text-ink-muted ml-1">
                  DAY{streak !== 1 ? "S" : ""}
                </span>
              </span>
            </div>
          </div>
        )}
      </div>

      {/* ── Graph area ─────────────────────────────────────────── */}
      <div className="bg-paper border-b-4 border-ink">
        {loading ? (
          <div className="h-36 flex items-center justify-center font-black uppercase tracking-widest text-sm text-ink-muted motion-safe:animate-pulse">
            BUILDING HEATMAP…
          </div>
        ) : !hasData ? (
          <div className="h-36 flex flex-col items-center justify-center gap-3">
            <span className="font-black uppercase tracking-widest text-sm text-ink-muted">
              NO TIMESTAMP DATA YET
            </span>
            <span className="font-bold text-[11px] text-ink-muted text-center px-6">
              Ensure <code className="font-mono">mintDate</code> is stored in the
              indexer schema — mints will appear here after re-indexing
            </span>
          </div>
        ) : (
          <div className="overflow-x-auto touch-pan-x px-5 md:px-8 lg:px-10 py-6 md:py-8">
            {/* min-width keeps the 53-column grid at ≥11px/cell on narrow viewports */}
            <div style={{ minWidth: "767px" }}>
              {/* Month labels row */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: gridCols,
                  gap: gridGap,
                  marginBottom: gridGap,
                }}
              >
                <div aria-hidden="true" /> {/* spacer under day label column */}
                {cols.map((_, w) => {
                  const ml = monthLabels.find((m) => m.col === w)
                  return (
                    <div
                      key={w}
                      className="text-[9px] font-black uppercase tracking-wider text-ink-muted overflow-visible whitespace-nowrap"
                    >
                      {ml ? ml.label : ""}
                    </div>
                  )
                })}
              </div>

              {/* Day rows Sun → Sat */}
              {[0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => (
                <div
                  key={dayOfWeek}
                  style={{
                    display: "grid",
                    gridTemplateColumns: gridCols,
                    gap: gridGap,
                    marginBottom: gridGap,
                  }}
                >
                  {/* Day label — only Mon, Wed, Fri */}
                  <div className="text-[9px] font-black uppercase tracking-wider text-ink-muted flex items-center justify-end pr-1 shrink-0">
                    {dayOfWeek === 1
                      ? "MON"
                      : dayOfWeek === 3
                        ? "WED"
                        : dayOfWeek === 5
                          ? "FRI"
                          : ""}
                  </div>

                  {cols.map((week, w) => {
                    const cell = week[dayOfWeek]
                    return (
                      <HeatmapCell
                        key={w}
                        count={cell.count}
                        dateKey={cell.key}
                        isFuture={cell.isFuture}
                        isToday={cell.isToday}
                        cellBg={cellBg(cell.count, cell.isFuture)}
                      />
                    )
                  })}
                </div>
              ))}

              {/* Legend + peak callout */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: gridCols,
                  gap: gridGap,
                  marginTop: "8px",
                }}
              >
                <div aria-hidden="true" />
                <div
                  className="col-span-53 flex items-center justify-between"
                  style={{ gridColumn: "2 / -1" }}
                >
                  <div className="flex items-center gap-1.5">
                    <span className="text-[9px] font-black uppercase tracking-wider text-ink-muted mr-0.5">
                      LESS
                    </span>
                    {GREEN_SCALE.map((bg) => (
                      <div
                        key={bg}
                        style={{
                          width: "11px",
                          height: "11px",
                          backgroundColor: bg,
                        }}
                        aria-hidden="true"
                      />
                    ))}
                    <span className="text-[9px] font-black uppercase tracking-wider text-ink-muted ml-0.5">
                      MORE
                    </span>
                  </div>
                  {peakKey && (
                    <div className="hidden sm:flex items-center gap-2">
                      <span className="text-[9px] font-black uppercase tracking-[0.18em] text-ink-muted">
                        PEAK
                      </span>
                      <span className="text-[11px] font-black uppercase tracking-wider text-ink">
                        {formatDayLabel(peakKey)} — {peakCount.toLocaleString()} MINTS
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Summary stat strip ─────────────────────────────────── */}
      {hasData && !loading && (
        <div className="grid grid-cols-2 divide-x-4 divide-ink bg-white">
          <div className="px-4 sm:px-6 py-5 md:px-8 md:py-6">
            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-ink-muted mb-1">
              ACTIVE DAYS
            </p>
            <p className="text-2xl md:text-3xl font-black tracking-tighter leading-none">
              {activeDays.toLocaleString()}
            </p>
          </div>
          <div className="px-4 sm:px-6 py-5 md:px-8 md:py-6">
            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-ink-muted mb-1">
              PEAK DAY
            </p>
            <p className="text-2xl md:text-3xl font-black tracking-tighter leading-none">
              {peakCount.toLocaleString()}
              <span className="text-xs font-bold uppercase tracking-widest text-ink-muted ml-1.5">
                MINTS
              </span>
            </p>
            {peakKey && (
              <p className="text-[9px] font-bold uppercase tracking-widest text-ink-muted mt-0.5">
                {formatDayLabel(peakKey)}
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
export default function AnalyticsDashboard() {
  const [maxSupply, setMaxSupply] = useState<number | null>(null)
  const [maxSupplyError, setMaxSupplyError] = useState(false)
  const [totalMinted, setTotalMinted] = useState<number | null>(null)
  const [chainStats, setChainStats] = useState<Record<ChainKey, ChainStats>>({
    base: { mintCount: 0, revenue: [] },
    arbitrum: { mintCount: 0, revenue: [] },
    lisk: { mintCount: 0, revenue: [] },
    manta: { mintCount: 0, revenue: [] },
  })
  const [liveActivity, setLiveActivity] = useState<MintItem[]>([])
  const [dailyCounts, setDailyCounts] = useState<Map<string, number>>(new Map())
  const [globalLoading, setGlobalLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [minterSearch, setMinterSearch] = useState("")
  const [page, setPage] = useState(0)
  const PAGE_SIZE = 10

  // Track the current in-flight AbortController so we can cancel stale requests
  const abortRef = useRef<AbortController | null>(null)

  // Fetch maxSupply once on mount — it's a contract constant, no need to poll
  useEffect(() => {
    const controller = new AbortController()
    fetchMaxSupply(TSB_CONTRACTS.base, BASE_RPC_URL, controller.signal)
      .then(setMaxSupply)
      .catch((err) => {
        if ((err as Error)?.name !== "AbortError") setMaxSupplyError(true)
      })
    return () => controller.abort()
  }, [])

  // ── Derived: filtered over ALL data, then sliced for current page ──
  const filteredActivity = useMemo(() => {
    const q = minterSearch.trim().toLowerCase()
    if (!q) return liveActivity
    return liveActivity.filter((m) => m.minter.toLowerCase().includes(q))
  }, [liveActivity, minterSearch])

  const totalPages = Math.max(1, Math.ceil(filteredActivity.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages - 1)
  const pagedActivity = filteredActivity.slice(
    safePage * PAGE_SIZE,
    (safePage + 1) * PAGE_SIZE
  )

  // Reset to first page whenever the search query changes
  useEffect(() => {
    setPage(0)
  }, [minterSearch])

  // ── Single-fetch data loader ────────────────────────────────
  // One GraphQL request fetches all mints; per-chain and per-token stats are
  // derived in-memory from that single response, cutting requests from ~21 → 1.
  const loadData = useCallback(async () => {
    // Cancel any previously in-flight request
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setGlobalLoading(true)
    setError(null)

    try {
      const allMints = await fetchAllMints(controller.signal)

      // Guard: ignore result if this request was superseded
      if (controller.signal.aborted) return

      // Total confirmed mints
      const confirmed = allMints.filter((m) => Number(m.status) === STATUS_CONFIRMED)
      setTotalMinted(confirmed.length)

      // Live activity: sort desc by id (numeric), show all
      const sorted = [...allMints].sort((a, b) => Number(b.id) - Number(a.id))
      setLiveActivity(sorted)

      // Derive all chain/token stats from the same response — no extra requests
      setChainStats(deriveChainStats(allMints))
      setDailyCounts(deriveDailyMintCounts(allMints))
    } catch (err) {
      if ((err as Error)?.name === "AbortError") return // cancelled; not an error
      if (import.meta.env.DEV) console.error("[loadData]", err)
      setError("Failed to load mint data. Please try again.")
    } finally {
      if (!controller.signal.aborted) {
        setGlobalLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    loadData()
    // Poll every 30s for live updates
    const interval = setInterval(loadData, 30_000)
    return () => {
      clearInterval(interval)
      abortRef.current?.abort() // cancel any in-flight request on unmount
    }
  }, [loadData])

  const totalConfirmed = totalMinted ?? 0
  const percentMinted =
    maxSupply !== null && maxSupply > 0 ? (totalConfirmed / maxSupply) * 100 : 0

  return (
    <div className="min-h-screen bg-paper-mid text-ink font-sans antialiased selection:bg-ink selection:text-paper-mid">
      <main className="mx-auto max-w-450 border-x-0 xl:border-x-4 border-ink min-h-screen bg-paper flex flex-col">
        <h1 className="sr-only">Encoteki Cross-Chain Minting Analytics</h1>
        {/* ── ENV Badge ───────────────────────────────────────── */}
        <div
          className={`flex justify-end px-4 py-2 border-b-2 border-ink ${APP_ENV === "prod" ? "bg-ink text-paper-mid" : "bg-warning text-ink"}`}
        >
          <span className="text-xs font-black uppercase tracking-widest">
            {APP_ENV === "prod" ? "PRODUCTION" : "LOCAL"} ENVIRONMENT
          </span>
        </div>

        {/* ── HERO TIER ─────────────────────────────────────────── */}
        <section className="grid grid-cols-1 md:grid-cols-12 border-b-4 border-ink">
          {/* Global Metric */}
          <div className="md:col-span-8 p-6 md:p-10 lg:p-12 md:border-r-4 border-b-4 md:border-b-0 border-ink flex flex-col justify-between relative overflow-hidden">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-6 mb-8 lg:mb-16 relative z-10">
              <div className="max-w-md">
                <h2 className="text-xl md:text-3xl font-black uppercase tracking-tight leading-none">
                  TOTAL SUPPLY MINTED
                </h2>
              </div>
              <div
                className={`px-4 py-2 text-sm md:text-base font-bold uppercase tracking-widest self-start shrink-0 ${maxSupplyError ? "bg-warning text-ink" : "bg-ink text-paper-mid"}`}
              >
                {maxSupplyError
                  ? "SUPPLY UNAVAILABLE"
                  : globalLoading || maxSupply === null
                    ? "LOADING…"
                    : `${(maxSupply - totalConfirmed).toLocaleString()} REMAINING`}
              </div>
            </div>

            <div className="relative z-10 mt-auto">
              {error ? (
                <div role="alert" className="mb-6 flex flex-col gap-4">
                  <div className="text-danger font-bold text-lg uppercase tracking-widest">
                    {error}
                  </div>
                  <button
                    onClick={loadData}
                    className="self-start min-h-11 flex items-center gap-2 px-4 py-2 border-4 border-ink bg-white font-black uppercase tracking-widest text-sm hover:bg-ink hover:text-paper-mid transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                    aria-label="Retry loading data"
                  >
                    <RefreshCw className="w-4 h-4" strokeWidth={3} />
                    RETRY
                  </button>
                </div>
              ) : (
                <div className="text-[clamp(5rem,12vw,14rem)] font-black tracking-tighter leading-[0.85] mb-6 md:mb-8">
                  {globalLoading ? "—" : totalConfirmed.toLocaleString()}
                </div>
              )}

              {/* Progress Bar */}
              <div
                className="w-full h-8 md:h-12 border-4 border-ink bg-white relative overflow-hidden"
                role="progressbar"
                aria-valuenow={Math.round(percentMinted)}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`${Math.round(percentMinted)}% of total supply minted`}
              >
                <div
                  className="absolute top-0 left-0 h-full bg-ink transition-[width] duration-1000 ease-out border-r-4 border-white motion-reduce:transition-none"
                  style={{ width: `${percentMinted}%` }}
                />
              </div>
            </div>

            {/* Decorative grid */}
            <div
              className="absolute inset-0 z-0 opacity-[0.03] pointer-events-none"
              aria-hidden="true"
              style={{
                backgroundImage:
                  "linear-gradient(#0F0F0F 1px, transparent 1px), linear-gradient(90deg, #0F0F0F 1px, transparent 1px)",
                backgroundSize: "32px 32px",
              }}
            />
          </div>

          {/* Chain Stack */}
          <div className="md:col-span-4 grid grid-cols-2 md:grid-cols-1 bg-ink">
            {CHAIN_KEYS.map((key) => {
              const meta = CHAIN_META[key]
              const stats = chainStats[key]
              return (
                <div
                  key={key}
                  className={`p-4 md:p-6 lg:p-8 flex flex-col justify-center border-b-4 border-ink md:last:border-b-0 transition-all min-h-35 md:min-h-auto ${meta.bg} ${meta.text}`}
                >
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <div className="flex items-center gap-2">
                      <img
                        src={meta.icon}
                        alt=""
                        width={32}
                        height={32}
                        className="w-6 h-6 sm:w-8 sm:h-8 rounded-full object-cover  bg-white"
                      />
                      <span className="text-lg sm:text-xl lg:text-3xl font-black uppercase tracking-tight leading-none">
                        {meta.name}
                      </span>
                    </div>
                    {TSB_CONTRACTS[key] && (
                      <a
                        href={`${EXPLORER_TOKEN_URLS[key]}${TSB_CONTRACTS[key]}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-center min-w-11 min-h-11 rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current hover:scale-115 transition-all duration-150 ease-out"
                        aria-label={`View ${meta.name} TSB contract on explorer`}
                      >
                        <ExternalLink className="w-4 h-4 sm:w-5 sm:h-5 stroke-[1.5]" />
                      </a>
                    )}
                  </div>
                  <div className="text-4xl sm:text-5xl lg:text-7xl font-black tracking-tighter leading-none mt-auto">
                    {globalLoading ? "—" : stats.mintCount.toLocaleString()}
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        {/* ── DAILY MINT HEATMAP ────────────────────────────────── */}
        <MintHeatmap
          dailyCounts={dailyCounts}
          loading={globalLoading && dailyCounts.size === 0}
        />

        {/* ── REVENUE TIER ──────────────────────────────────────── */}
        <section className="border-b-4 border-ink">
          <div className="p-4 md:p-6 lg:px-10 border-b-4 border-ink bg-white">
            <h2 className="text-lg md:text-2xl lg:text-3xl font-black uppercase tracking-tight">
              COLLECTED REVENUE
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 divide-y-4 sm:divide-y-0 border-b-4 sm:border-b-0 border-ink">
            {CHAIN_KEYS.map((key, index) => {
              const meta = CHAIN_META[key]
              const stats = chainStats[key]
              const tokens = CHAIN_TOKENS[key]

              return (
                <div
                  key={key}
                  className={`p-6 md:p-8 flex flex-col h-full bg-paper-mid hover:bg-white transition-colors
                    ${index % 2 !== 0 ? "sm:border-l-4 border-ink" : ""}
                    ${index > 1 ? "xl:border-l-4 sm:border-t-4 xl:border-t-0 border-ink" : ""}
                  `}
                >
                  <div className="text-sm font-black uppercase tracking-widest mb-8 pb-4 border-b-4 border-ink">
                    {meta.name}
                  </div>

                  <div className="space-y-6">
                    {globalLoading && stats.revenue.length === 0 ? (
                      <div className="text-lg font-bold text-ink-muted uppercase tracking-widest motion-safe:animate-pulse">
                        LOADING…
                      </div>
                    ) : stats.revenue.length === 0 ? (
                      <div className="text-sm font-bold text-ink-muted uppercase tracking-widest">
                        NO ACTIVITY
                      </div>
                    ) : (
                      tokens.map(({ symbol, icon }) => {
                        const rev = stats.revenue.find((r) => r.symbol === symbol)
                        const count = rev?.count ?? 0
                        const amount = rev?.amount ?? 0
                        if (!rev) return null
                        return (
                          <div key={symbol} className="flex flex-col">
                            <div className="flex items-center gap-2 mb-1">
                              <img
                                src={icon || TOKEN_ICONS[symbol]}
                                alt=""
                                width={20}
                                height={20}
                                className="w-4 h-4 sm:w-6 sm:h-6 rounded-full object-cover"
                              />
                              <span className="text-xs font-bold text-ink-muted uppercase tracking-widest">
                                {symbol}
                              </span>
                            </div>
                            <span className="text-3xl md:text-4xl font-black">
                              {formatAmount(amount, symbol)}
                            </span>
                            <span className="text-xs font-bold text-ink-muted uppercase tracking-widest mt-1">
                              {count.toLocaleString()} MINTS
                            </span>
                          </div>
                        )
                      })
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        {/* ── LIVE MINTING ACTIVITY ─────────────────────────────── */}
        <section className="bg-white flex-1">
          <div className="p-4 md:p-6 lg:px-10 border-b-4 border-ink flex flex-col gap-4 bg-ink text-paper-mid">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
              <div>
                <h2 className="text-lg md:text-2xl lg:text-3xl font-black uppercase tracking-tight">
                  LIVE MINTING ACTIVITY
                </h2>
              </div>
              <div className="text-sm font-bold uppercase tracking-widest flex items-center gap-2 shrink-0">
                <span className="bg-white/10 text-paper-mid px-3 py-1 text-xs">
                  {filteredActivity.length.toLocaleString()}
                  {minterSearch
                    ? ` / ${liveActivity.length.toLocaleString()}`
                    : ""}{" "}
                  EVENTS
                </span>
              </div>
            </div>

            {/* Search bar */}
            <div className="relative flex items-center max-w-md">
              <Search
                className="absolute left-3 w-3.5 h-3.5 opacity-40 pointer-events-none shrink-0"
                strokeWidth={2.5}
                aria-hidden="true"
              />
              <label htmlFor="minter-search" className="sr-only">
                Filter by minter address
              </label>
              <input
                id="minter-search"
                type="text"
                value={minterSearch}
                onChange={(e) => setMinterSearch(e.target.value)}
                placeholder="Filter by minter address…"
                spellCheck={false}
                autoComplete="off"
                className="w-full bg-white/8 text-paper-mid font-mono text-sm placeholder:text-paper-mid/30 placeholder:font-sans placeholder:text-sm pl-8 pr-11 py-2.5 border border-white/15 focus:border-white/50 outline-none focus-visible:ring-1 focus-visible:ring-white/50 focus-visible:ring-inset transition-colors rounded-none"
              />
              {minterSearch && (
                <button
                  onClick={() => setMinterSearch("")}
                  className="absolute right-0 top-1/2 -translate-y-1/2 w-11 h-11 flex items-center justify-center opacity-40 hover:opacity-80 transition-opacity focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-white/60"
                  aria-label="Clear search"
                >
                  <X className="w-3.5 h-3.5" strokeWidth={2.5} />
                </button>
              )}
            </div>
          </div>

          <div className="overflow-x-auto w-full touch-pan-x">
            <table
              className="w-full text-left whitespace-nowrap border-collapse min-w-200"
              aria-label="Live minting activity"
            >
              <thead>
                <tr className="border-b-4 border-ink text-xs md:text-sm font-black uppercase tracking-widest bg-paper-mid">
                  <th
                    scope="col"
                    className="px-4 py-5 md:px-6 w-32 border-r-4 border-ink"
                  >
                    ID
                  </th>
                  <th scope="col" className="px-4 py-5 md:px-6 border-r-4 border-ink">
                    DATE
                  </th>
                  <th scope="col" className="px-4 py-5 md:px-6 border-r-4 border-ink">
                    MINTER
                  </th>
                  <th scope="col" className="px-4 py-5 md:px-6 border-r-4 border-ink">
                    NETWORK
                  </th>
                  <th scope="col" className="px-4 py-5 md:px-6 border-r-4 border-ink">
                    TOKEN
                  </th>
                  <th scope="col" className="px-4 py-5 md:px-6 border-r-4 border-ink">
                    TOKEN ID
                  </th>
                  <th scope="col" className="px-4 py-5 md:px-6">
                    STATE
                  </th>
                </tr>
              </thead>
              <tbody className="font-mono text-sm md:text-base font-bold">
                {globalLoading && liveActivity.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-6 py-12 text-center font-black uppercase tracking-widest text-ink-muted motion-safe:animate-pulse"
                    >
                      FETCHING EVENTS…
                    </td>
                  </tr>
                ) : filteredActivity.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-6 py-12 text-center font-black uppercase tracking-widest text-ink-muted"
                    >
                      {minterSearch
                        ? `NO RESULTS FOR "${minterSearch.toUpperCase()}"`
                        : "NO EVENTS INDEXED"}
                    </td>
                  </tr>
                ) : (
                  pagedActivity.map((mint) => {
                    const chainKey = chainKeyById(Number(mint.chainId))
                    const meta = chainKey ? CHAIN_META[chainKey] : null
                    const tokenSymbol = chainKey
                      ? (tokenSymbolByAddress(mint.paymentToken, chainKey) ??
                        mint.paymentToken.slice(0, 8) + "…")
                      : mint.paymentToken.slice(0, 8) + "…"
                    const state = statusLabel(mint.status)

                    return (
                      <tr
                        key={mint.id}
                        className="border-b-2 border-ink hover:bg-paper-dark transition-colors group"
                      >
                        <td className="px-4 py-4 md:px-6 border-r-4 border-ink text-ink tabular-nums">
                          #{mint.id}
                        </td>
                        <td className="px-4 py-4 md:px-6 border-r-4 border-ink opacity-60 tabular-nums">
                          {formatMintDate(mint.mintDate)}
                        </td>
                        <td className="px-4 py-4 md:px-6 border-r-4 border-ink opacity-80 group-hover:opacity-100">
                          {shortAddress(mint.minter)}
                        </td>
                        <td className="px-4 py-4 md:px-6 border-r-4 border-ink">
                          {meta ? (
                            <span
                              className={`inline-flex items-center gap-2 justify-center px-3 py-1 text-xs uppercase tracking-widest font-black ${meta.bg} ${meta.text}`}
                            >
                              <img
                                src={meta.icon}
                                alt=""
                                width={16}
                                height={16}
                                className="w-6 h-6 rounded-full bg-white"
                              />
                              {meta.name}
                            </span>
                          ) : (
                            <span className="text-xs text-ink-muted">
                              {mint.chainId}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-4 md:px-6 border-r-4 border-ink opacity-80 group-hover:opacity-100">
                          <div className="flex items-center gap-2">
                            {tokenSymbol &&
                              Object.keys(TOKEN_ICONS).includes(tokenSymbol) && (
                                <img
                                  src={TOKEN_ICONS[tokenSymbol as TokenSymbol]}
                                  alt=""
                                  width={16}
                                  height={16}
                                  className="w-6 h-6 rounded-full"
                                />
                              )}
                            {tokenSymbol}
                          </div>
                        </td>
                        <td className="px-4 py-4 md:px-6 border-r-4 border-ink opacity-60 tabular-nums">
                          {mint.tokenId}
                        </td>
                        <td className="px-4 py-4 md:px-6">
                          <div className="flex items-center gap-3">
                            {state === "CONFIRMED" && (
                              <span
                                className="w-3 h-3 bg-success shrink-0 rounded-full"
                                aria-hidden="true"
                              />
                            )}
                            {state === "PENDING" && (
                              <span
                                className="w-3 h-3 border-2 border-ink border-r-transparent rounded-full motion-safe:animate-spin shrink-0"
                                aria-hidden="true"
                              />
                            )}
                            {state === "FAILED" && (
                              <span
                                className="w-3 h-3 bg-danger shrink-0 rounded-full"
                                aria-hidden="true"
                              />
                            )}
                            <span className="uppercase tracking-widest">
                              {mint.statusDesc || state}
                            </span>
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination footer */}
          <div className="p-4 md:p-6 lg:px-10 border-t-4 border-ink bg-paper-mid flex justify-between items-center gap-4">
            <span className="text-xs font-bold uppercase tracking-widest opacity-60 hidden sm:block">
              PAGE {safePage + 1} OF {totalPages}
              {minterSearch
                ? `  ·  ${filteredActivity.length.toLocaleString()} RESULTS`
                : `  ·  ${liveActivity.length.toLocaleString()} EVENTS`}
            </span>
            <nav
              aria-label="Activity pagination"
              className="flex items-center gap-3 w-full sm:w-auto"
            >
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={safePage === 0}
                className="flex-1 sm:flex-none min-h-12 px-6 font-black uppercase tracking-widest border-4 border-ink bg-white text-black hover:bg-ink hover:text-paper-mid transition-colors flex items-center justify-center gap-2 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-white disabled:hover:text-black focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-ink"
                aria-label="Previous page"
              >
                <ArrowLeft className="w-4 h-4" strokeWidth={3} aria-hidden="true" />
                PREV
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={safePage >= totalPages - 1}
                className="flex-1 sm:flex-none min-h-12 px-6 font-black uppercase tracking-widest border-4 border-ink text-paper-mid bg-ink hover:bg-white hover:text-black transition-colors flex items-center justify-center gap-2 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-ink disabled:hover:text-paper-mid focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-ink"
                aria-label="Next page"
              >
                NEXT
                <ArrowRight className="w-4 h-4" strokeWidth={3} aria-hidden="true" />
              </button>
            </nav>
          </div>
        </section>
      </main>
    </div>
  )
}
