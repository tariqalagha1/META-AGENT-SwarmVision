import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.setViewportSize({ width: 1440, height: 900 });
await page.goto('http://localhost:5174/index.html');
await page.waitForTimeout(2000);
await page.locator('.top-nav-tab').nth(1).click();
await page.waitForTimeout(500);
await page.locator('button', { hasText: /demo/i }).first().click();
await page.waitForTimeout(5000);

// Zoom into INTAKE agent area
await page.screenshot({ path: '/tmp/sim-zoom-intake.png', clip: { x: 30, y: 260, width: 310, height: 260 } });
// Zoom into FORGE area 
await page.screenshot({ path: '/tmp/sim-zoom-forge.png', clip: { x: 370, y: 260, width: 290, height: 260 } });
// Zoom into DISPATCH bottom row
await page.screenshot({ path: '/tmp/sim-zoom-dispatch.png', clip: { x: 370, y: 520, width: 290, height: 260 } });

// Check canvas context type - pixi.js uses webgl
const canvasInfo = await page.evaluate(() => {
  const canvas = document.querySelector('canvas');
  if (!canvas) return { found: false };
  // Try WebGL context
  const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
  const ctx2d = canvas.getContext('2d');
  return {
    found: true,
    hasWebGL: !!gl,
    has2D: !!ctx2d,
    width: canvas.width,
    height: canvas.height,
    cssWidth: canvas.style.width,
    cssHeight: canvas.style.height,
  };
});
console.log('Canvas context:', JSON.stringify(canvasInfo, null, 2));

await browser.close();
