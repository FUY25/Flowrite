const fs = require('fs/promises')
const os = require('os')
const path = require('path')
const { execFileSync } = require('child_process')
const { launchElectron, closeElectron } = require('./helpers')

const projectRoot = path.resolve(__dirname, '..', '..')

const packElectronApp = () => {
  execFileSync('yarn', ['run', 'pack'], {
    cwd: projectRoot,
    env: {
      ...process.env,
      NODE_ENV: 'production'
    },
    stdio: 'inherit'
  })
}

const verifyPackedLaunch = async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'marktext-e2e-global-setup-'))
  const userDataDir = path.join(tempRoot, 'user-data')
  const articlePath = path.join(tempRoot, 'draft.md')
  let app = null

  await fs.writeFile(articlePath, '# Draft\n\nA reflective paragraph with a soft cadence.\n', 'utf8')

  try {
    const launched = await launchElectron([articlePath], { userDataDir })
    app = launched.app
  } finally {
    await closeElectron(app)
    await fs.rm(tempRoot, { recursive: true, force: true })
  }
}

module.exports = async () => {
  packElectronApp()
  await verifyPackedLaunch()
}
