// ============================================================
// app/lib/graphql.ts
// GraphQL fetch helpers — all queries derived from GRAPHQL.md
// ============================================================

import { GRAPHQL_URL } from "~/config";

export interface MintItem {
  id: string;
  minter: string;
  tokenId: string;
  paymentToken: string;
  chainId: string;
  status: string;
  statusDesc: string;
}

interface GraphQLResponse<T> {
  data?: T;
  errors?: { message: string }[];
}

async function gqlFetch<T>(
  query: string,
  variables?: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<T> {
  const res = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
    signal,
  });

  if (!res.ok) {
    throw new Error(`GraphQL network error: ${res.status} ${res.statusText}`);
  }

  const json: GraphQLResponse<T> = await res.json();

  if (json.errors?.length) {
    throw new Error(json.errors.map(e => e.message).join("; "));
  }

  if (!json.data) {
    throw new Error("GraphQL returned no data");
  }

  return json.data;
}

// ── Query: fetch ALL mints (no filter) ───────────────────────
const QUERY_ALL = /* graphql */ `
  {
    mints {
      items {
        id
        minter
        tokenId
        paymentToken
        chainId
        status
        statusDesc
      }
    }
  }
`;

interface MintsAllData {
  mints: { items: MintItem[] };
}

export async function fetchAllMints(signal?: AbortSignal): Promise<MintItem[]> {
  const data = await gqlFetch<MintsAllData>(QUERY_ALL, undefined, signal);
  return data.mints.items;
}

// ── Query: fetch mints filtered by chainId ───────────────────
const QUERY_BY_CHAIN = /* graphql */ `
  query GetByChainId($chainId: BigInt!) {
    mints(where: { chainId: $chainId }) {
      items {
        id
        minter
        tokenId
        paymentToken
        chainId
        status
        statusDesc
      }
    }
  }
`;

interface MintsByChainData {
  mints: { items: MintItem[] };
}

export async function fetchMintsByChain(chainId: number): Promise<MintItem[]> {
  const data = await gqlFetch<MintsByChainData>(QUERY_BY_CHAIN, { chainId: chainId.toString() });
  return data.mints.items;
}

// ── Query: fetch mints filtered by chainId + paymentToken ────
const QUERY_BY_CHAIN_AND_TOKEN = /* graphql */ `
  query GetMintCount($chainId: BigInt!, $paymentToken: String!) {
    mints(where: { chainId: $chainId, paymentToken: $paymentToken }) {
      items {
        id
        minter
        tokenId
        paymentToken
        chainId
        status
        statusDesc
      }
    }
  }
`;

interface MintsByChainAndTokenData {
  mints: { items: MintItem[] };
}

export async function fetchMintsByChainAndToken(
  chainId: number,
  paymentToken: string,
): Promise<MintItem[]> {
  const data = await gqlFetch<MintsByChainAndTokenData>(QUERY_BY_CHAIN_AND_TOKEN, {
    chainId: chainId.toString(),
    paymentToken,
  });
  return data.mints.items;
}

// ── Status constant ──────────────────────────────────────────
export const STATUS_CONFIRMED = 3;
