import { chromium } from 'playwright'

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage()
await page.setViewportSize({ width: 1440, height: 900 })

await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' })

const vizTab = page.locator('button, a, [role="tab"]').filter({ hasText: /visuali/i })
if (await vizTab.count() > 0) await vizTab.first().click()
await page.waitForTimeout(800)
await page.screenshot({ path: 'sprint4_visualize_home.png', fullPage: false })

const opsBtn = page.locator('button').filter({ hasText: /ops view/i })
if (await opsBtn.count() > 0) await opsBtn.first().click()
await page.waitForTimeout(1500)
await page.screenshot({ path: 'sprint4_visualize_ops.png', fullPage: false })

const demoBtn = page.locator('button').filter({ hasText: /demo view/i })
if (await demoBtn.count() > 0) await demoBtn.first().click()
await page.waitForTimeout(4000)
await page.screenshot({ path: 'sprint4_visualize_demo.png', fullPage: false })

const canvas = page.locator('canvas').first()
if (await canvas.count()) {
  await canvas.screenshot({ path: 'sprint4_visualize_demo_canvas.png' })
}

await browser.close()
console.log('saved sprint4_visualize_home.png, sprint4_visualize_ops.png, sprint4_visualize_demo.png, sprint4_visualize_demo_canvas.png')
