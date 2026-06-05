import { chromium } from 'playwright'

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage()
await page.setViewportSize({ width: 1440, height: 900 })
await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' })

const vizTab = page.locator('button, a, [role="tab"]').filter({ hasText: /visuali/i })
if (await vizTab.count()) await vizTab.first().click()
await page.waitForTimeout(800)

await page.screenshot({ path: 'sprint5_visualize_home.png', fullPage: false })

const replayBtn = page.locator('button').filter({ hasText: /^Replay$/ })
if (await replayBtn.count()) await replayBtn.first().click()
await page.waitForTimeout(800)
await page.screenshot({ path: 'sprint5_visualize_replay.png', fullPage: false })

const compareBtn = page.locator('button').filter({ hasText: /^Compare$/ })
if (await compareBtn.count()) await compareBtn.first().click()
await page.waitForTimeout(800)
await page.screenshot({ path: 'sprint5_visualize_compare.png', fullPage: false })

const demoBtn = page.locator('button').filter({ hasText: /demo view/i })
if (await demoBtn.count()) await demoBtn.first().click()
await page.waitForTimeout(3000)
await page.screenshot({ path: 'sprint5_visualize_demo.png', fullPage: false })

await browser.close()
console.log('saved sprint5_visualize_home.png, sprint5_visualize_replay.png, sprint5_visualize_compare.png, sprint5_visualize_demo.png')
