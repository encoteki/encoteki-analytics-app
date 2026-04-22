import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "react-router"

import type { Route } from "./+types/root"
import "./app.css"

function safeOrigin(url: string | undefined): string | null {
  if (!url) return null
  try {
    return new URL(url).origin
  } catch {
    return null
  }
}

const APP_ENV = import.meta.env.VITE_APP_ENV ?? "local"
const GRAPHQL_ORIGIN = safeOrigin(
  APP_ENV === "local"
    ? import.meta.env.VITE_GRAPHQL_URL_LOCAL
    : import.meta.env.VITE_GRAPHQL_URL_PROD
)
const RPC_ORIGIN = safeOrigin(
  APP_ENV === "local"
    ? (import.meta.env.VITE_TESTNET_RPC_URL_BASE ?? "https://sepolia.base.org")
    : (import.meta.env.VITE_MAINNET_RPC_URL_BASE ?? "https://mainnet.base.org")
)

const connectSrc = ["'self'", GRAPHQL_ORIGIN, RPC_ORIGIN].filter(Boolean).join(" ")

const CSP = [
  "default-src 'self'",
  `connect-src ${connectSrc}`,
  "script-src 'self'",
  // Tailwind v4 injects <style> tags at runtime — unsafe-inline required
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ")

export const headers: Route.HeadersFunction = () => ({
  "Content-Security-Policy": CSP,
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "geolocation=(), camera=(), microphone=()",
})

export const links: Route.LinksFunction = () => [
  { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
  // Swap the line above for one of these when you have a better format:
  // { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
  // { rel: "icon", href: "/favicon.png", type: "image/png", sizes: "32x32" },
  // Apple touch icon (home screen shortcut on iOS):
  // { rel: "apple-touch-icon", href: "/apple-touch-icon.png", sizes: "180x180" },
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  {
    rel: "preconnect",
    href: "https://fonts.gstatic.com",
    crossOrigin: "anonymous",
  },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&display=swap",
  },
]

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  )
}

export default function App() {
  return <Outlet />
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "Oops!"
  let details = "An unexpected error occurred."
  let stack: string | undefined

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "404" : "Error"
    details =
      error.status === 404
        ? "The requested page could not be found."
        : error.statusText || details
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message
    stack = error.stack
  }

  return (
    <main className="pt-16 p-4 container mx-auto">
      <h1>{message}</h1>
      <p>{details}</p>
      {stack && (
        <pre className="w-full p-4 overflow-x-auto">
          <code>{stack}</code>
        </pre>
      )}
    </main>
  )
}
