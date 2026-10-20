/* Plain-JS entry for hosts that only accept a .js/.mjs entry file (e.g. Hostinger's
   Node.js apps). It registers tsx's loader and boots the TypeScript server, exactly
   as `npm start` does. */
import { register } from 'tsx/esm/api'

process.env.NODE_ENV ??= 'production'
register()
await import('./server/index.ts')
