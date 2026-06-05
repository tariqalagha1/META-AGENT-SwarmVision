import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '..', '..')
const baselineRoot = path.join(repoRoot, 'ui-baseline')
const manifestPath = path.join(baselineRoot, 'visual-regression.json')
const appUrl = process.env.VIEWER_BASE_URL ?? 'http://127.0.0.1:5173'

const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'))

const viewports = [
  { key: 'desktop', ...manifest.viewports.desktop },
  { key: 'tablet', ...manifest.viewports.tablet },
]

const protectedSelectors = manifest.protected_surfaces

async function ensureProtectedShell(page, mode) {
  await page.getByRole('tab', { name: new RegExp(mode === 'command' ? 'command' : mode === 'observe' ? 'observe' : 'visualize', 'i') }).click()
  await page.waitForTimeout(800)

  if (mode === 'visualize-ops') {
    await page.getByRole('button', { name: /^OPS VIEW$/i }).click()
    await page.waitForTimeout(1200)
  }

  if (mode === 'visualize-demo') {
    await page.getByRole('button', { name: /^DEMO VIEW$/i }).click()
    await page.waitForTimeout(1200)
  }

  for (const surface of protectedSelectors) {
    if (mode !== 'observe' && surface.name !== 'TopCommandBar') continue
    const locator = page.locator(surface.selector).first()
    await locator.waitFor({ state: 'visible' })
  }
}

async function captureMode(page, viewportKey, mode, filename) {
  await ensureProtectedShell(page, mode)
  const outPath = path.join(baselineRoot, viewportKey, filename)
  await page.screenshot({ path: outPath, fullPage: true })
}

const browser = await chromium.launch({ headless: true })

try {
  for (const viewport of viewports) {
    await fs.mkdir(path.join(baselineRoot, viewport.key), { recursive: true })
    const page = await browser.newPage({
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: 1,
    })
    await page.goto(appUrl, { waitUntil: 'networkidle' })
    await captureMode(page, viewport.key, 'observe', 'observe.png')
    await captureMode(page, viewport.key, 'visualize-ops', 'visualize-ops.png')
    await captureMode(page, viewport.key, 'visualize-demo', 'visualize-demo.png')
    await captureMode(page, viewport.key, 'command', 'command.png')
    await page.close()
  }
  process.stdout.write(`Viewer freeze baselines captured in ${baselineRoot}`)
} finally {
  await browser.close()
}
