const config = {
  globalSetup: require.resolve('./global-setup'),
  workers: 1,
  use: {
    headless: false,
    viewport: { width: 1280, height: 720 },
    timeout: 30000
  }
}
module.exports = config
