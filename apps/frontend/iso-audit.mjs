import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.setViewportSize({ width: 1440, height: 900 });
await page.goto('http://localhost:5174/index.html');
await page.waitForTimeout(3000);

await page.locator('.top-nav-tab').nth(1).click();
await page.waitForTimeout(800);
await page.locator('button', { hasText: /demo/i }).first().click();
await page.waitForTimeout(5000);

// Full view
await page.screenshot({ path: '/tmp/iso-1-full.png' });
console.log('Screenshot 1: full view');

// Wait for more animation
await page.waitForTimeout(3000);
await page.screenshot({ path: '/tmp/iso-2-animated.png' });
console.log('Screenshot 2: animated');

// Top row rooms
await page.screenshot({ path: '/tmp/iso-3-top-row.png', clip: { x: 0, y: 100, width: 1440, height: 400 } });
console.log('Screenshot 3: top row rooms');

// Bottom row rooms
await page.screenshot({ path: '/tmp/iso-4-bottom-row.png', clip: { x: 0, y: 430, width: 1440, height: 380 } });
console.log('Screenshot 4: bottom row rooms');

// Left rooms detail
await page.screenshot({ path: '/tmp/iso-5-left-rooms.png', clip: { x: 0, y: 100, width: 560, height: 700 } });
console.log('Screenshot 5: left rooms detail');

// Right rooms detail
await page.screenshot({ path: '/tmp/iso-6-right-rooms.png', clip: { x: 700, y: 100, width: 740, height: 700 } });
console.log('Screenshot 6: right rooms detail');

// Check console errors
const errors = [];
page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
await page.waitForTimeout(2000);

console.log('Console errors:', errors);
await browser.close();
