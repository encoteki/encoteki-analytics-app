// ============================================================
// app/lib/rpc.ts
// Minimal JSON-RPC helpers for read-only contract calls.
// No external dependencies — uses native fetch.
// ============================================================

interface RpcResponse {
  result?: string
  error?: { code: number; message: string }
}

async function ethCall(
  rpcUrl: string,
  to: string,
  data: string,
  signal?: AbortSignal
): Promise<string> {
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "eth_call",
      params: [{ to, data }, "latest"],
      id: 1,
    }),
    signal,
  })

  if (!res.ok) throw new Error(`RPC network error: ${res.status} ${res.statusText}`)

  const json: RpcResponse = await res.json()
  if (json.error) throw new Error(`RPC error ${json.error.code}: ${json.error.message}`)
  if (!json.result || json.result === "0x") throw new Error("RPC returned empty result")

  return json.result
}

// selector: keccak256("maxSupply()")[0:4] = 0xd5abeb01
const MAX_SUPPLY_SELECTOR = "0xd5abeb01"

/**
 * Read `maxSupply()` from an ERC-721 contract via JSON-RPC.
 * Returns the value as a JS number (safe up to 2^53 − 1).
 */
export async function fetchMaxSupply(
  contractAddress: string,
  rpcUrl: string,
  signal?: AbortSignal
): Promise<number> {
  const hex = await ethCall(rpcUrl, contractAddress, MAX_SUPPLY_SELECTOR, signal)
  if (!/^0x[0-9a-fA-F]+$/.test(hex)) {
    throw new Error(`RPC returned unexpected result format: ${hex.slice(0, 20)}`)
  }
  return Number(BigInt(hex))
}
