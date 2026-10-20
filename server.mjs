/* Plain-JS entry for hosts that only accept a .js/.mjs entry file (e.g. Hostinger's
   Node.js apps). It registers tsx's loader and boots the TypeScript server, exactly
   as `npm start` does. Hostinger's Express preset has no build step, so the client
   bundle is built here on first boot when dist/ is missing. */
import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { register } from 'tsx/esm/api'

if (!existsSync('dist/index.html')) execSync('npx vite build', { stdio: 'inherit' })

process.env.NODE_ENV ??= 'production'
register()
await import('./server/index.ts')
