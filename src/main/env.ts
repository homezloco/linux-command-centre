import { config } from 'dotenv'
import { join } from 'path'
import { app } from 'electron'

// Loads .env.local (gitignored, never packaged) so main-process code can
// read process.env.CLAUDE_API_KEY etc. Must be imported before any module
// that reads those vars at call time. In dev the file sits at the project
// root (the app path); in packaged builds users can drop the same file in
// the app's userData directory instead.
config({ path: join(app.getAppPath(), '.env.local') })
if (app.isPackaged) {
  config({ path: join(app.getPath('userData'), '.env.local') })
}
