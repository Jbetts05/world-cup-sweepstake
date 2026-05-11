import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const root = process.cwd()
const apiRoot = join(root, 'apps', 'api')
const deployRoot = join(apiRoot, 'deploy')
const apiPackage = JSON.parse(await readFile(join(apiRoot, 'package.json'), 'utf8'))

await rm(deployRoot, { recursive: true, force: true })
await mkdir(deployRoot, { recursive: true })
await cp(join(apiRoot, 'dist'), join(deployRoot, 'dist'), { recursive: true })
await cp(join(apiRoot, 'host.json'), join(deployRoot, 'host.json'))

await writeFile(
  join(deployRoot, 'package.json'),
  `${JSON.stringify({
    name: 'world-cup-sweepstake-api-deploy',
    version: apiPackage.version,
    private: true,
    main: apiPackage.main,
    dependencies: {
      '@azure/functions': apiPackage.dependencies['@azure/functions'],
    },
  }, null, 2)}\n`,
  'utf8',
)
