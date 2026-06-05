import { chromium } from 'playwright'

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage()
await page.setViewportSize({ width: 1440, height: 900 })

// Fresh load — no cache
await page.goto('http://localhost:5180/', { waitUntil: 'networkidle' })

// Go to Visualize tab
const vizTab = page.locator('button, a, [role="tab"]').filter({ hasText: /visuali/i })
if (await vizTab.count() > 0) await vizTab.first().click()
await page.waitForTimeout(500)

// Click DEMO VIEW
const demoBtn = page.locator('button').filter({ hasText: /demo/i })
if (await demoBtn.count() > 0) await demoBtn.first().click()

// Wait for PixiJS to fully render
await page.waitForTimeout(4000)
await page.screenshot({ path: 'polish_new_01.png', fullPage: false })

await page.waitForTimeout(5000)
await page.screenshot({ path: 'polish_new_02.png', fullPage: false })

// Get canvas and screenshot it alone
const canvas = page.locator('canvas').first()
const box = await canvas.boundingBox()
console.log('Canvas box:', JSON.stringify(box))
await canvas.screenshot({ path: 'polish_new_canvas.png' })

await browser.close()
console.log('Done — screenshots at polish_new_01.png, polish_new_02.png, polish_new_canvas.png')
