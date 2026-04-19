import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import type { Route } from "./+types/home";
import { ArrowUpRight, ArrowRight, ArrowLeft, Search, X, RefreshCw } from "lucide-react";

import {
  APP_ENV,
  TOTAL_SUPPLY,
  CHAIN_IDS,
  CHAIN_TOKENS,
  CHAIN_META,
  MINT_PRICES,
  TOKEN_ICONS,
  chainKeyById,
  tokenSymbolByAddress,
  type ChainKey,
  type TokenSymbol,
} from "~/config";
import {
  fetchAllMints,
  STATUS_CONFIRMED,
  type MintItem,
} from "~/lib/graphql";

// ── Meta ─────────────────────────────────────────────────────
export function meta({}: Route.MetaArgs) {
  return [
    { title: "Analytics — Encoteki" },
    {
      name: "Encoteki Analytics",
      content: "Encoteki cross-chain minting dashboard",
    },
  ];
}

// ── Types ────────────────────────────────────────────────────
interface TokenRevenue {
  symbol: TokenSymbol;
  amount: number; // count * mint price
  count: number;
}

interface ChainStats {
  mintCount: number; // confirmed mints (status == 3) for this chain
  revenue: TokenRevenue[];
}

// ── Helpers ──────────────────────────────────────────────────
const CHAIN_KEYS: ChainKey[] = ["base", "arbitrum", "lisk", "manta"];

function formatAmount(amount: number, symbol: TokenSymbol): string {
  if (symbol === "ETH") return amount.toFixed(4);
  if (symbol === "IDRX")
    return new Intl.NumberFormat("en-US").format(Math.round(amount));
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(
    amount,
  );
}

function shortAddress(address: string): string {
  if (address.length < 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function statusLabel(status: string): "CONFIRMED" | "PENDING" | "FAILED" {
  const n = Number(status);
  if (n === 3) return "CONFIRMED";
  if (n === 2) return "PENDING";
  return "FAILED";
}

/**
 * Derive all per-chain and per-token stats from a flat list of mints.
 * Eliminates N+M additional GraphQL requests — everything is in fetchAllMints().
 */
function deriveChainStats(
  allMints: MintItem[],
): Record<ChainKey, ChainStats> {
  // Build a map: chainId → paymentToken (lowercase) → count
  const chainTokenCounts = new Map<
    number,
    Map<string, number>
  >();

  for (const mint of allMints) {
    if (Number(mint.status) !== STATUS_CONFIRMED) continue;
    const cid = Number(mint.chainId);
    if (!chainTokenCounts.has(cid)) chainTokenCounts.set(cid, new Map());
    const tokenMap = chainTokenCounts.get(cid)!;
    const addr = mint.paymentToken.toLowerCase();
    tokenMap.set(addr, (tokenMap.get(addr) ?? 0) + 1);
  }

  const result = {} as Record<ChainKey, ChainStats>;

  for (const key of CHAIN_KEYS) {
    const chainId = CHAIN_IDS[key];
    const tokenMap = chainTokenCounts.get(chainId) ?? new Map<string, number>();

    // Total confirmed mints for this chain
    let mintCount = 0;
    for (const count of tokenMap.values()) mintCount += count;

    // Per-token revenue — only tokens with activity
    const revenue: TokenRevenue[] = CHAIN_TOKENS[key]
      .map(({ symbol, address }) => {
        const count = tokenMap.get(address.toLowerCase()) ?? 0;
        return {
          symbol,
          count,
          amount: count * MINT_PRICES[symbol],
        } satisfies TokenRevenue;
      })
      .filter((r) => r.count > 0);

    result[key] = { mintCount, revenue };
  }

  return result;
}

// ── Component ────────────────────────────────────────────────
export default function AnalyticsDashboard() {
  const [totalMinted, setTotalMinted] = useState<number | null>(null);
  const [chainStats, setChainStats] = useState<Record<ChainKey, ChainStats>>({
    base:     { mintCount: 0, revenue: [] },
    arbitrum: { mintCount: 0, revenue: [] },
    lisk:     { mintCount: 0, revenue: [] },
    manta:    { mintCount: 0, revenue: [] },
  });
  const [liveActivity, setLiveActivity] = useState<MintItem[]>([]);
  const [globalLoading, setGlobalLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [minterSearch, setMinterSearch] = useState("");
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 10;

  // Track the current in-flight AbortController so we can cancel stale requests
  const abortRef = useRef<AbortController | null>(null);

  // ── Derived: filtered over ALL data, then sliced for current page ──
  const filteredActivity = useMemo(() => {
    const q = minterSearch.trim().toLowerCase();
    if (!q) return liveActivity;
    return liveActivity.filter((m) => m.minter.toLowerCase().includes(q));
  }, [liveActivity, minterSearch]);

  const totalPages = Math.max(
    1,
    Math.ceil(filteredActivity.length / PAGE_SIZE),
  );
  const safePage = Math.min(page, totalPages - 1);
  const pagedActivity = filteredActivity.slice(
    safePage * PAGE_SIZE,
    (safePage + 1) * PAGE_SIZE,
  );

  // Reset to first page whenever the search query changes
  useEffect(() => {
    setPage(0);
  }, [minterSearch]);

  // ── Single-fetch data loader ────────────────────────────────
  // One GraphQL request fetches all mints; per-chain and per-token stats are
  // derived in-memory from that single response, cutting requests from ~21 → 1.
  const loadData = useCallback(async () => {
    // Cancel any previously in-flight request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setGlobalLoading(true);
    setError(null);

    try {
      const allMints = await fetchAllMints(controller.signal);

      // Guard: ignore result if this request was superseded
      if (controller.signal.aborted) return;

      // Total confirmed mints
      const confirmed = allMints.filter(
        (m) => Number(m.status) === STATUS_CONFIRMED,
      );
      setTotalMinted(confirmed.length);

      // Live activity: sort desc by id (numeric), show all
      const sorted = [...allMints].sort((a, b) => Number(b.id) - Number(a.id));
      setLiveActivity(sorted);

      // Derive all chain/token stats from the same response — no extra requests
      setChainStats(deriveChainStats(allMints));
    } catch (err) {
      if ((err as Error)?.name === "AbortError") return; // cancelled; not an error
      setError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      if (!controller.signal.aborted) {
        setGlobalLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    loadData();
    // Poll every 30s for live updates
    const interval = setInterval(loadData, 30_000);
    return () => {
      clearInterval(interval);
      abortRef.current?.abort(); // cancel any in-flight request on unmount
    };
  }, [loadData]);

  const totalConfirmed = totalMinted ?? 0;
  // Guard against division-by-zero if TOTAL_SUPPLY is 0 or misconfigured
  const percentMinted = TOTAL_SUPPLY > 0 ? (totalConfirmed / TOTAL_SUPPLY) * 100 : 0;

  return (
    <div className="min-h-screen bg-[#EFECE6] text-[#0F0F0F] font-sans antialiased selection:bg-[#0F0F0F] selection:text-[#EFECE6]">
      <main className="mx-auto max-w-450 border-x-0 xl:border-x-4 border-[#0F0F0F] min-h-screen bg-[#F4F1EA] flex flex-col">
        {/* ── ENV Badge ───────────────────────────────────────── */}
        <div
          className={`flex justify-end px-4 py-2 border-b-2 border-[#0F0F0F] ${APP_ENV === "mainnet" ? "bg-[#0F0F0F] text-[#EFECE6]" : "bg-yellow-400 text-[#0F0F0F]"}`}
        >
          <span className="text-xs font-black uppercase tracking-widest">
            {APP_ENV === "mainnet" ? "MAINNET" : "TESTNET"} ENVIRONMENT
          </span>
        </div>

        {/* ── HERO TIER ─────────────────────────────────────────── */}
        <section className="grid grid-cols-1 lg:grid-cols-12 border-b-4 border-[#0F0F0F]">
          {/* Global Metric */}
          <div className="lg:col-span-8 p-6 md:p-10 lg:p-12 lg:border-r-4 border-b-4 lg:border-b-0 border-[#0F0F0F] flex flex-col justify-between relative overflow-hidden">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-6 mb-8 lg:mb-16 relative z-10">
              <div className="max-w-md">
                <h2 className="text-xl md:text-3xl font-black uppercase tracking-tight leading-none mb-3">
                  TOTAL SUPPLY MINTED
                </h2>
                <p className="text-sm md:text-base font-bold opacity-70 leading-relaxed">
                  Confirmed mints (status&nbsp;3) aggregated across all
                  connected networks.
                </p>
              </div>
              <div className="bg-[#0F0F0F] text-[#EFECE6] px-4 py-2 text-sm md:text-base font-bold uppercase tracking-widest self-start shrink-0">
                {globalLoading
                  ? "LOADING…"
                  : `${(TOTAL_SUPPLY - totalConfirmed).toLocaleString()} REMAINING`}
              </div>
            </div>

            <div className="relative z-10 mt-auto">
              {error ? (
                <div className="mb-6 flex flex-col gap-4">
                  <div className="text-red-600 font-bold text-lg uppercase tracking-widest">
                    {error}
                  </div>
                  <button
                    onClick={loadData}
                    className="self-start flex items-center gap-2 px-4 py-2 border-4 border-[#0F0F0F] bg-white font-black uppercase tracking-widest text-sm hover:bg-[#0F0F0F] hover:text-[#EFECE6] transition-colors"
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
                className="w-full h-8 md:h-12 border-4 border-[#0F0F0F] bg-white relative overflow-hidden"
                role="progressbar"
                aria-valuenow={Math.round(percentMinted)}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`${Math.round(percentMinted)}% of total supply minted`}
              >
                <div
                  className="absolute top-0 left-0 h-full bg-[#0F0F0F] transition-[width] duration-1000 ease-out border-r-4 border-white motion-reduce:transition-none"
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
          <div className="lg:col-span-4 grid grid-cols-2 lg:grid-cols-1 bg-[#0F0F0F]">
            {CHAIN_KEYS.map((key) => {
              const meta = CHAIN_META[key];
              const stats = chainStats[key];
              return (
                <div
                  key={key}
                  className={`p-4 md:p-6 lg:p-8 flex flex-col justify-center border-b-4 border-[#0F0F0F] lg:last:border-b-0 transition-all min-h-35 lg:min-h-auto ${meta.bg} ${meta.text}`}
                >
                  <div className="flex flex-col xl:flex-row xl:justify-between xl:items-start gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <img
                        src={meta.icon}
                        alt=""
                        width={32}
                        height={32}
                        className="w-6 h-6 sm:w-8 sm:h-8 rounded-full object-cover border-2 border-current bg-white"
                      />
                      <span className="text-lg sm:text-xl lg:text-3xl font-black uppercase tracking-tight leading-none">
                        {meta.name}
                      </span>
                    </div>
                    <span
                      className={`px-2 py-0.5 text-[10px] sm:text-xs font-black uppercase tracking-widest w-fit ${meta.badge}`}
                    >
                      {globalLoading ? "SYNC…" : "ONLINE"}
                    </span>
                  </div>
                  <div className="text-4xl sm:text-5xl lg:text-7xl font-black tracking-tighter leading-none mt-auto">
                    {globalLoading ? "—" : stats.mintCount.toLocaleString()}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* ── REVENUE TIER ──────────────────────────────────────── */}
        <section className="border-b-4 border-[#0F0F0F]">
          <div className="p-4 md:p-6 lg:px-10 border-b-4 border-[#0F0F0F] bg-white flex justify-between items-center">
            <div>
              <h2 className="text-lg md:text-2xl lg:text-3xl font-black uppercase tracking-tight">
                COLLECTED REVENUE
              </h2>
              <p className="text-xs md:text-sm font-bold opacity-60 mt-1 uppercase tracking-widest hidden sm:block">
                Confirmed mints × mint price per payment token, isolated by
                network
              </p>
            </div>
            <ArrowUpRight
              className="w-8 h-8 md:w-10 md:h-10 shrink-0"
              strokeWidth={3}
              aria-hidden="true"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 divide-y-4 sm:divide-y-0 border-b-4 sm:border-b-0 border-[#0F0F0F]">
            {CHAIN_KEYS.map((key, index) => {
              const meta = CHAIN_META[key];
              const stats = chainStats[key];
              const tokens = CHAIN_TOKENS[key];

              return (
                <div
                  key={key}
                  className={`p-6 md:p-8 flex flex-col h-full bg-[#EFECE6] hover:bg-white transition-colors group
                    ${index % 2 !== 0 ? "sm:border-l-4 border-[#0F0F0F]" : ""}
                    ${index > 1 ? "xl:border-l-4 sm:border-t-4 xl:border-t-0 border-[#0F0F0F]" : ""}
                  `}
                >
                  <div className="text-sm font-black uppercase tracking-widest mb-8 pb-4 border-b-4 border-[#0F0F0F] flex items-center justify-between">
                    <span>{meta.name} VAULT</span>
                    <span className="w-3 h-3 bg-[#0F0F0F] opacity-0 group-hover:opacity-100 transition-opacity" aria-hidden="true" />
                  </div>

                  <div className="space-y-6">
                    {globalLoading && stats.revenue.length === 0 ? (
                      <div className="text-lg font-bold opacity-30 uppercase tracking-widest motion-safe:animate-pulse">
                        LOADING…
                      </div>
                    ) : stats.revenue.length === 0 ? (
                      <div className="text-sm font-bold opacity-30 uppercase tracking-widest">
                        NO ACTIVITY
                      </div>
                    ) : (
                      tokens.map(({ symbol, icon }) => {
                        const rev = stats.revenue.find(
                          (r) => r.symbol === symbol,
                        );
                        const count = rev?.count ?? 0;
                        const amount = rev?.amount ?? 0;
                        if (!rev) return null;
                        return (
                          <div key={symbol} className="flex flex-col">
                            <div className="flex items-center gap-2 mb-1">
                              <img
                                src={icon || TOKEN_ICONS[symbol]}
                                alt=""
                                width={20}
                                height={20}
                                className="w-4 h-4 sm:w-5 sm:h-5 rounded-full object-cover border border-[#0F0F0F] bg-white"
                              />
                              <span className="text-xs font-bold opacity-50 uppercase tracking-widest">
                                {symbol}
                              </span>
                            </div>
                            <span className="text-3xl md:text-4xl font-black tracking-tighter">
                              {formatAmount(amount, symbol)}
                            </span>
                            <span className="text-xs font-bold opacity-40 uppercase tracking-widest mt-1">
                              {count.toLocaleString()} MINTS
                            </span>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* ── LIVE MINTING ACTIVITY ─────────────────────────────── */}
        <section className="bg-white flex-1">
          <div className="p-4 md:p-6 lg:px-10 border-b-4 border-[#0F0F0F] flex flex-col gap-4 bg-[#0F0F0F] text-[#EFECE6]">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
              <div>
                <h2 className="text-lg md:text-2xl lg:text-3xl font-black uppercase tracking-tight">
                  LIVE MINTING ACTIVITY
                </h2>
                <p className="text-xs md:text-sm font-bold opacity-60 mt-1 uppercase tracking-widest">
                  All events sorted by ID descending — refreshes every 30s
                </p>
              </div>
              <div className="text-sm font-bold uppercase tracking-widest flex items-center gap-2 shrink-0">
                <span className="bg-white/10 text-[#EFECE6] px-3 py-1 text-xs">
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
                className="w-full bg-white/8 text-[#EFECE6] font-mono text-sm placeholder:text-[#EFECE6]/30 placeholder:font-sans placeholder:text-sm pl-8 pr-8 py-2.5 border border-white/15 focus:border-white/35 outline-none transition-colors rounded-none"
              />
              {minterSearch && (
                <button
                  onClick={() => setMinterSearch("")}
                  className="absolute right-2.5 opacity-35 hover:opacity-70 transition-opacity"
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
                <tr className="border-b-4 border-[#0F0F0F] text-xs md:text-sm font-black uppercase tracking-widest bg-[#EFECE6]">
                  <th scope="col" className="px-4 py-5 md:px-6 w-32 border-r-4 border-[#0F0F0F]">
                    ID
                  </th>
                  <th scope="col" className="px-4 py-5 md:px-6 border-r-4 border-[#0F0F0F]">
                    MINTER
                  </th>
                  <th scope="col" className="px-4 py-5 md:px-6 border-r-4 border-[#0F0F0F]">
                    NETWORK
                  </th>
                  <th scope="col" className="px-4 py-5 md:px-6 border-r-4 border-[#0F0F0F]">
                    TOKEN
                  </th>
                  <th scope="col" className="px-4 py-5 md:px-6 border-r-4 border-[#0F0F0F]">
                    TOKEN ID
                  </th>
                  <th scope="col" className="px-4 py-5 md:px-6">STATE</th>
                </tr>
              </thead>
              <tbody className="font-mono text-sm md:text-base font-bold">
                {globalLoading && liveActivity.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-6 py-12 text-center font-black uppercase tracking-widest opacity-40 motion-safe:animate-pulse"
                    >
                      FETCHING EVENTS…
                    </td>
                  </tr>
                ) : filteredActivity.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-6 py-12 text-center font-black uppercase tracking-widest opacity-40"
                    >
                      {minterSearch
                        ? `NO RESULTS FOR "${minterSearch.toUpperCase()}"`
                        : "NO EVENTS INDEXED"}
                    </td>
                  </tr>
                ) : (
                  pagedActivity.map((mint) => {
                    const chainKey = chainKeyById(Number(mint.chainId));
                    const meta = chainKey ? CHAIN_META[chainKey] : null;
                    const tokenSymbol = chainKey
                      ? (tokenSymbolByAddress(mint.paymentToken, chainKey) ??
                        mint.paymentToken.slice(0, 8) + "…")
                      : mint.paymentToken.slice(0, 8) + "…";
                    const state = statusLabel(mint.status);

                    return (
                      <tr
                        key={mint.id}
                        className="border-b-2 border-[#0F0F0F] hover:bg-[#DCD8CF] transition-colors group"
                      >
                        <td className="px-4 py-4 md:px-6 border-r-4 border-[#0F0F0F] text-black">
                          #{mint.id}
                        </td>
                        <td className="px-4 py-4 md:px-6 border-r-4 border-[#0F0F0F] opacity-80 group-hover:opacity-100">
                          {shortAddress(mint.minter)}
                        </td>
                        <td className="px-4 py-4 md:px-6 border-r-4 border-[#0F0F0F]">
                          {meta ? (
                            <span
                              className={`inline-flex items-center gap-2 justify-center px-3 py-1 text-xs uppercase tracking-widest font-black ${meta.bg} ${meta.text}`}
                            >
                              <img
                                src={meta.icon}
                                alt=""
                                width={16}
                                height={16}
                                className="w-4 h-4 rounded-full border border-current bg-white"
                              />
                              {meta.name}
                            </span>
                          ) : (
                            <span className="text-xs opacity-50">
                              {mint.chainId}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-4 md:px-6 border-r-4 border-[#0F0F0F] opacity-80 group-hover:opacity-100">
                          <div className="flex items-center gap-2">
                            {tokenSymbol &&
                              Object.keys(TOKEN_ICONS).includes(
                                tokenSymbol,
                              ) && (
                                <img
                                  src={TOKEN_ICONS[tokenSymbol as TokenSymbol]}
                                  alt=""
                                  width={16}
                                  height={16}
                                  className="w-4 h-4 rounded-full border border-[#0F0F0F] bg-white"
                                />
                              )}
                            {tokenSymbol}
                          </div>
                        </td>
                        <td className="px-4 py-4 md:px-6 border-r-4 border-[#0F0F0F] opacity-60">
                          {mint.tokenId}
                        </td>
                        <td className="px-4 py-4 md:px-6">
                          <div className="flex items-center gap-3">
                            {state === "CONFIRMED" && (
                              <span className="w-3 h-3 bg-black shrink-0" aria-hidden="true" />
                            )}
                            {state === "PENDING" && (
                              <span className="w-3 h-3 border-2 border-black border-r-transparent rounded-full motion-safe:animate-spin shrink-0" aria-hidden="true" />
                            )}
                            {state === "FAILED" && (
                              <span className="w-3 h-3 bg-red-600 shrink-0" aria-hidden="true" />
                            )}
                            <span className="uppercase tracking-widest">
                              {mint.statusDesc || state}
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination footer */}
          <div className="p-4 md:p-6 lg:px-10 border-t-4 border-[#0F0F0F] bg-[#EFECE6] flex justify-between items-center gap-4">
            <span className="text-xs font-bold uppercase tracking-widest opacity-60 hidden sm:block">
              PAGE {safePage + 1} OF {totalPages}
              {minterSearch
                ? `  ·  ${filteredActivity.length.toLocaleString()} RESULTS`
                : `  ·  ${liveActivity.length.toLocaleString()} EVENTS`}
            </span>
            <nav aria-label="Activity pagination" className="flex items-center gap-3 w-full sm:w-auto">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={safePage === 0}
                className="flex-1 sm:flex-none min-h-12 px-6 font-black uppercase tracking-widest border-4 border-[#0F0F0F] bg-white text-black hover:bg-[#0F0F0F] hover:text-[#EFECE6] transition-colors flex items-center justify-center gap-2 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-white disabled:hover:text-black"
                aria-label="Previous page"
              >
                <ArrowLeft className="w-4 h-4" strokeWidth={3} aria-hidden="true" />
                PREV
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={safePage >= totalPages - 1}
                className="flex-1 sm:flex-none min-h-12 px-6 font-black uppercase tracking-widest border-4 border-[#0F0F0F] text-[#EFECE6] bg-[#0F0F0F] hover:bg-white hover:text-black transition-colors flex items-center justify-center gap-2 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-[#0F0F0F] disabled:hover:text-[#EFECE6]"
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
  );
}
