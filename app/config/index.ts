// ============================================================
// app/config/index.ts
// Reads all VITE_ env vars and exports a fully typed config.
// Change values via .env — no code edits needed.
// ============================================================

export type ChainKey = "base" | "arbitrum" | "lisk" | "manta"
export type TokenSymbol = "ETH" | "USDC" | "USDT" | "IDRX" | "ARB" | "LSK" | "MANTA"

export interface TokenConfig {
  symbol: TokenSymbol
  address: string
  icon: string
}

export interface ChainConfig {
  key: ChainKey
  name: string
  chainId: number
  tokens: TokenConfig[]
  // UI theming
  bg: string
  text: string
  badge: string
}

// ── Environment ──────────────────────────────────────────────
export const APP_ENV = (import.meta.env.VITE_APP_ENV ?? "testnet") as
  | "testnet"
  | "mainnet"
export const IS_MAINNET = APP_ENV === "mainnet"
export const GRAPHQL_URL = import.meta.env.VITE_GRAPHQL_URL as string
export const TOTAL_SUPPLY = Number(import.meta.env.VITE_TOTAL_SUPPLY ?? 4000)

// ── Chain IDs ────────────────────────────────────────────────
const TESTNET_CHAIN_IDS: Record<ChainKey, number> = {
  base: Number(import.meta.env.VITE_TESTNET_CHAIN_ID_BASE ?? 84532),
  arbitrum: Number(import.meta.env.VITE_TESTNET_CHAIN_ID_ARBITRUM ?? 421614),
  lisk: Number(import.meta.env.VITE_TESTNET_CHAIN_ID_LISK ?? 4202),
  manta: Number(import.meta.env.VITE_TESTNET_CHAIN_ID_MANTA ?? 3441006),
}

const MAINNET_CHAIN_IDS: Record<ChainKey, number> = {
  base: Number(import.meta.env.VITE_MAINNET_CHAIN_ID_BASE ?? 8453),
  arbitrum: Number(import.meta.env.VITE_MAINNET_CHAIN_ID_ARBITRUM ?? 42161),
  lisk: Number(import.meta.env.VITE_MAINNET_CHAIN_ID_LISK ?? 1135),
  manta: Number(import.meta.env.VITE_MAINNET_CHAIN_ID_MANTA ?? 169),
}

export const CHAIN_IDS: Record<ChainKey, number> = IS_MAINNET
  ? MAINNET_CHAIN_IDS
  : TESTNET_CHAIN_IDS

// ── Token Addresses ──────────────────────────────────────────
const ZERO = "0x0000000000000000000000000000000000000000"

// Tokens with a blank address are kept in the list (shown in UI) but skipped in queries.
// Fill in the VITE_TESTNET_*_TOKEN_* vars in .env when contracts are deployed to testnet.
const TESTNET_TOKENS: Record<ChainKey, TokenConfig[]> = {
  base: [
    {
      symbol: "ETH",
      address: import.meta.env.VITE_TESTNET_BASE_TOKEN_ETH ?? ZERO,
      icon: ethTokenIcon,
    },
    {
      symbol: "USDC",
      address: import.meta.env.VITE_TESTNET_BASE_TOKEN_USDC ?? "",
      icon: usdcTokenIcon,
    },
    {
      symbol: "IDRX",
      address: import.meta.env.VITE_TESTNET_BASE_TOKEN_IDRX ?? "",
      icon: idrxTokenIcon,
    },
  ],
  arbitrum: [
    {
      symbol: "ETH",
      address: import.meta.env.VITE_TESTNET_ARBITRUM_TOKEN_ETH ?? ZERO,
      icon: ethTokenIcon,
    },
    {
      symbol: "USDC",
      address: import.meta.env.VITE_TESTNET_ARBITRUM_TOKEN_USDC ?? "",
      icon: usdcTokenIcon,
    },
    {
      symbol: "USDT",
      address: import.meta.env.VITE_TESTNET_ARBITRUM_TOKEN_USDT ?? "",
      icon: usdtTokenIcon,
    },
    {
      symbol: "ARB",
      address: import.meta.env.VITE_TESTNET_ARBITRUM_TOKEN_ARB ?? "",
      icon: arbTokenIcon,
    },
  ],
  lisk: [
    {
      symbol: "ETH",
      address: import.meta.env.VITE_TESTNET_LISK_TOKEN_ETH ?? ZERO,
      icon: ethTokenIcon,
    },
    {
      symbol: "USDT",
      address: import.meta.env.VITE_TESTNET_LISK_TOKEN_USDT ?? "",
      icon: usdtTokenIcon,
    },
    {
      symbol: "IDRX",
      address: import.meta.env.VITE_TESTNET_LISK_TOKEN_IDRX ?? "",
      icon: idrxTokenIcon,
    },
    {
      symbol: "LSK",
      address: import.meta.env.VITE_TESTNET_LISK_TOKEN_LSK ?? "",
      icon: lskTokenIcon,
    },
  ],
  manta: [
    {
      symbol: "ETH",
      address: import.meta.env.VITE_TESTNET_MANTA_TOKEN_ETH ?? ZERO,
      icon: ethTokenIcon,
    },
    {
      symbol: "USDT",
      address: import.meta.env.VITE_TESTNET_MANTA_TOKEN_USDT ?? "",
      icon: usdtTokenIcon,
    },
    {
      symbol: "USDC",
      address: import.meta.env.VITE_TESTNET_MANTA_TOKEN_USDC ?? "",
      icon: usdcTokenIcon,
    },
    {
      symbol: "MANTA",
      address: import.meta.env.VITE_TESTNET_MANTA_TOKEN_MANTA ?? "",
      icon: mantaTokenIcon,
    },
  ],
}

const MAINNET_TOKENS: Record<ChainKey, TokenConfig[]> = {
  base: [
    {
      symbol: "ETH",
      address: import.meta.env.VITE_MAINNET_BASE_TOKEN_ETH ?? ZERO,
      icon: ethTokenIcon,
    },
    {
      symbol: "USDC",
      address: import.meta.env.VITE_MAINNET_BASE_TOKEN_USDC ?? ZERO,
      icon: usdcTokenIcon,
    },
    {
      symbol: "IDRX",
      address: import.meta.env.VITE_MAINNET_BASE_TOKEN_IDRX ?? ZERO,
      icon: idrxTokenIcon,
    },
  ],
  arbitrum: [
    {
      symbol: "ETH",
      address: import.meta.env.VITE_MAINNET_ARBITRUM_TOKEN_ETH ?? ZERO,
      icon: ethTokenIcon,
    },
    {
      symbol: "USDC",
      address: import.meta.env.VITE_MAINNET_ARBITRUM_TOKEN_USDC ?? ZERO,
      icon: usdcTokenIcon,
    },
    {
      symbol: "USDT",
      address: import.meta.env.VITE_MAINNET_ARBITRUM_TOKEN_USDT ?? ZERO,
      icon: usdtTokenIcon,
    },
    {
      symbol: "ARB",
      address: import.meta.env.VITE_MAINNET_ARBITRUM_TOKEN_ARB ?? ZERO,
      icon: arbTokenIcon,
    },
  ],
  lisk: [
    {
      symbol: "ETH",
      address: import.meta.env.VITE_MAINNET_LISK_TOKEN_ETH ?? ZERO,
      icon: ethTokenIcon,
    },
    {
      symbol: "USDT",
      address: import.meta.env.VITE_MAINNET_LISK_TOKEN_USDT ?? ZERO,
      icon: usdtTokenIcon,
    },
    {
      symbol: "IDRX",
      address: import.meta.env.VITE_MAINNET_LISK_TOKEN_IDRX ?? ZERO,
      icon: idrxTokenIcon,
    },
    {
      symbol: "LSK",
      address: import.meta.env.VITE_MAINNET_LISK_TOKEN_LSK ?? ZERO,
      icon: lskTokenIcon,
    },
  ],
  manta: [
    {
      symbol: "ETH",
      address: import.meta.env.VITE_MAINNET_MANTA_TOKEN_ETH ?? ZERO,
      icon: ethTokenIcon,
    },
    {
      symbol: "USDT",
      address: import.meta.env.VITE_MAINNET_MANTA_TOKEN_USDT ?? ZERO,
      icon: usdtTokenIcon,
    },
    {
      symbol: "USDC",
      address: import.meta.env.VITE_MAINNET_MANTA_TOKEN_USDC ?? ZERO,
      icon: usdcTokenIcon,
    },
    {
      symbol: "MANTA",
      address: import.meta.env.VITE_MAINNET_MANTA_TOKEN_MANTA ?? ZERO,
      icon: mantaTokenIcon,
    },
  ],
}

export const CHAIN_TOKENS: Record<ChainKey, TokenConfig[]> = IS_MAINNET
  ? MAINNET_TOKENS
  : TESTNET_TOKENS

// ── Mint Prices (amount of token per mint) ───────────────────
// Revenue = count(confirmed mints for that token+chain) * MINT_PRICES[symbol]
export const MINT_PRICES: Record<TokenSymbol, number> = {
  ETH: Number(import.meta.env.VITE_MINT_PRICE_ETH ?? 0.0001),
  USDC: Number(import.meta.env.VITE_MINT_PRICE_USDC ?? 0.5),
  USDT: Number(import.meta.env.VITE_MINT_PRICE_USDT ?? 0.5),
  IDRX: Number(import.meta.env.VITE_MINT_PRICE_IDRX ?? 8000),
  ARB: Number(import.meta.env.VITE_MINT_PRICE_ARB ?? 1.5),
  LSK: Number(import.meta.env.VITE_MINT_PRICE_LSK ?? 5),
  MANTA: Number(import.meta.env.VITE_MINT_PRICE_MANTA ?? 2),
}

import arbTokenIcon from "~/assets/tokens/arb.svg"
import ethTokenIcon from "~/assets/tokens/eth.webp"
import idrxTokenIcon from "~/assets/tokens/idrx.webp"
import lskTokenIcon from "~/assets/tokens/lisk.webp"
import mantaTokenIcon from "~/assets/tokens/manta.png"
import usdtTokenIcon from "~/assets/tokens/tether.svg"
import usdcTokenIcon from "~/assets/tokens/usdc.png"

export const TOKEN_ICONS: Record<TokenSymbol, string> = {
  ETH: ethTokenIcon,
  USDC: usdcTokenIcon,
  USDT: usdtTokenIcon,
  IDRX: idrxTokenIcon,
  ARB: arbTokenIcon,
  LSK: lskTokenIcon,
  MANTA: mantaTokenIcon,
}

// ── Chain UI metadata ────────────────────────────────────────
import baseIcon from "~/assets/chains/base.jpeg"
import arbitrumIcon from "~/assets/chains/arbitrum.svg"
import liskIcon from "~/assets/chains/lisk.webp"
import mantaIcon from "~/assets/chains/manta.png"

export const CHAIN_META: Record<
  ChainKey,
  { name: string; bg: string; text: string; badge: string; icon: string }
> = {
  base: {
    name: "BASE",
    bg: "bg-[#0052FF]",
    text: "text-white",
    badge: "bg-white text-[#0052FF]",
    icon: baseIcon,
  },
  arbitrum: {
    name: "ARBITRUM",
    bg: "bg-[#28A0F0]",
    text: "text-white",
    badge: "bg-white text-[#28A0F0]",
    icon: arbitrumIcon,
  },
  lisk: {
    name: "LISK",
    bg: "bg-[#4070F4]",
    text: "text-white",
    badge: "bg-white text-[#4070F4]",
    icon: liskIcon,
  },
  manta: {
    name: "MANTA",
    bg: "bg-[#0A0A0A]",
    text: "text-white",
    badge: "bg-white text-[#0A0A0A]",
    icon: mantaIcon,
  },
}

// ── Helpers ──────────────────────────────────────────────────
/** Resolve a chainId number back to a ChainKey, or undefined if unknown. */
export function chainKeyById(id: number): ChainKey | undefined {
  return (Object.entries(CHAIN_IDS) as [ChainKey, number][]).find(
    ([, v]) => v === id
  )?.[0]
}

/** Resolve a paymentToken address to a TokenSymbol for a given chain. */
export function tokenSymbolByAddress(
  address: string,
  chainKey: ChainKey
): TokenSymbol | undefined {
  const lower = address.toLowerCase()
  return CHAIN_TOKENS[chainKey].find((t) => t.address.toLowerCase() === lower)?.symbol
}
