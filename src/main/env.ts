import { config } from 'dotenv'
import { join } from 'path'
import { app } from 'electron'

// Loads .env.local (dev-only, gitignored) so main-process code can read
// process.env.CLAUDE_API_KEY etc. Must be imported before any module that
// reads those vars at call time.
config({ path: join(app.getAppPath(), '.env.local') })
