import { spawn } from 'node:child_process'
import { rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const dataPath = join(root, 'apps', 'api', 'data', 'playwright.local.json')

rmSync(dataPath, { force: true })

const child = spawn('npm', ['run', 'start', '--workspace', '@world-cup/api'], {
  cwd: root,
  shell: true,
  stdio: 'inherit',
  env: {
    ...process.env,
    ADMIN_SECRET: 'local-dev-secret',
    WORLD_CUP_DATA_PATH: dataPath,
    WORLD_CUP_SEED_MODE: 'empty',
    FUNCTIONS_WORKER_RUNTIME: 'node',
    AzureWebJobsStorage: 'UseDevelopmentStorage=true',
  },
})

let isStopping = false

process.on('SIGTERM', () => stopChildTree(0))
process.on('SIGINT', () => stopChildTree(130))

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }

  process.exit(code ?? 0)
})

function stopChildTree(exitCode) {
  if (isStopping) {
    return
  }

  isStopping = true

  if (!child.pid) {
    process.exit(exitCode)
  }

  if (process.platform === 'win32') {
    const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
      stdio: 'ignore',
    })

    killer.on('exit', () => process.exit(exitCode))
    return
  }

  child.kill('SIGTERM')
  setTimeout(() => process.exit(exitCode), 1_000).unref()
}
