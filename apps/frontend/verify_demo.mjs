import { chromium } from 'playwright'
import { writeFileSync } from 'fs'

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage()
await page.setViewportSize({ width: 1440, height: 900 })

await page.goto('http://localhost:5175/', { waitUntil: 'networkidle' })
await page.screenshot({ path: 'verify_00_home.png' })

// Navigate to Visualize tab
const vizTab = page.locator('button, a, [role="tab"]').filter({ hasText: /visuali[sz]e/i })
if (await vizTab.count() > 0) {
  await vizTab.first().click()
  await page.waitForTimeout(1500)
  await page.screenshot({ path: 'verify_01_viz_tab.png' })
}

// Try to open DEMO VIEW
const demoBtn = page.locator('button').filter({ hasText: /demo|pixel|sim/i })
if (await demoBtn.count() > 0) {
  await demoBtn.first().click()
  await page.waitForTimeout(3000)
  await page.screenshot({ path: 'verify_02_demo_open.png', fullPage: false })
}

// Wait longer for animation to show Sims agents
await page.waitForTimeout(3000)
await page.screenshot({ path: 'verify_03_demo_3s.png', fullPage: false })

await page.waitForTimeout(5000)
await page.screenshot({ path: 'verify_04_demo_8s.png', fullPage: false })

// Check if canvas is present and not blank
const canvas = page.locator('canvas')
const canvasCount = await canvas.count()
console.log(`Canvas elements found: ${canvasCount}`)

if (canvasCount > 0) {
  const box = await canvas.first().boundingBox()
  console.log(`Canvas size: ${JSON.stringify(box)}`)
  await canvas.first().screenshot({ path: 'verify_05_canvas_only.png' })
}

await browser.close()
console.log('Done')
