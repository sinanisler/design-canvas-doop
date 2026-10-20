/* Plain-JS entry for hosts that only accept a .js/.mjs entry file (e.g. Hostinger's
   Node.js apps). It registers tsx's loader and boots the TypeScript server, exactly
   as `npm start` does. No top-level await: Hostinger's launcher loads this file with
   require(), which rejects async ESM. dist/ is built here when the host skipped it. */
import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { register } from 'tsx/esm/api'

if (!existsSync('dist/index.html')) execSync('npx vite build', { stdio: 'inherit' })

process.env.NODE_ENV ??= 'production'
register()
import('./server/index.ts').catch((error) => {
  console.error('doop failed to start:', error)
  process.exit(1)
})
