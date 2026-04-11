import fs from 'fs'
import path from 'path'
import dotenv from 'dotenv'

const resolveDotenvPaths = () => {
  const candidates = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(__dirname, '../../.env')
  ]

  return candidates.filter((pathname, index) => {
    return candidates.indexOf(pathname) === index && fs.existsSync(pathname)
  })
}

for (const envPath of resolveDotenvPaths()) {
  dotenv.config({ path: envPath })
}

// Set `__static` path to static files in production.
if (process.env.NODE_ENV !== 'development') {
  global.__static = path.join(__dirname, '/static').replace(/\\/g, '\\\\')
}
