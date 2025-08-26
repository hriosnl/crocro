import { readFileSync, writeFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

function buildManifest(browser) {
  const baseManifest = JSON.parse(
    readFileSync(resolve(__dirname, '../src/manifest.base.json'), 'utf8')
  )
  
  let browserSpecific = {}
  try {
    browserSpecific = JSON.parse(
      readFileSync(resolve(__dirname, `../src/manifest.${browser}.json`), 'utf8')
    )
  } catch (error) {
    console.warn(`No browser-specific manifest found for ${browser}`)
  }
  
  const mergedManifest = { ...baseManifest, ...browserSpecific }
  
  writeFileSync(
    resolve(__dirname, '../src/manifest.json'),
    JSON.stringify(mergedManifest, null, 2)
  )
  
  console.log(`Built manifest.json for ${browser}`)
}

const browser = process.argv[2] || 'chrome'
buildManifest(browser)