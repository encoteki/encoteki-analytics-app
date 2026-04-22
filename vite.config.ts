import { reactRouter } from "@react-router/dev/vite"
import tailwindcss from "@tailwindcss/vite"
import type { Plugin } from "vite"
import { defineConfig } from "vite"

const silenceChromeDevtools = (): Plugin => ({
  name: "silence-chrome-devtools",
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      if (req.url === "/.well-known/appspecific/com.chrome.devtools.json") {
        res.writeHead(404).end()
        return
      }
      next()
    })
  },
})

export default defineConfig({
  plugins: [tailwindcss(), silenceChromeDevtools(), reactRouter()],
  resolve: {
    tsconfigPaths: true,
  },
})
