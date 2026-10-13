// Headless browser smoke test. Run `npm run build` first, then `npm run verify`.
// Needs Playwright with a Chromium install (not a project dependency):
//   npm i -D playwright && npx playwright install chromium
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'

const require = createRequire(import.meta.url)
const { chromium } = require('playwright')

const PORT = 4179
const URL = `http://localhost:${PORT}/`
const OUT = process.env.VERIFY_OUT ?? 'verify-output'
mkdirSync(OUT, { recursive: true })

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore', shell: true })
const results = []
const check = (name, ok, detail = '') => {
  results.push(ok)
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

try {
  for (let i = 0; i < 40; i++) {
    try { if ((await fetch(URL)).ok) break } catch { /* not up yet */ }
    await sleep(250)
  }

  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
  const page = await browser.newPage({ viewport: { width: 1000, height: 700 } })
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  // Failed font requests (offline machine) are not app errors
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()) })

  await page.goto(URL)
  await page.waitForSelector('canvas')
  await page.waitForSelector('.marker', { timeout: 15000 })
  await sleep(800)
  check('canvas renders', (await page.locator('canvas').count()) === 1)
  check('5 markers shown', (await page.locator('.marker').count()) === 5)
  check('placeholder tag shown', await page.getByText('Placeholder model').first().isVisible())
  await page.screenshot({ path: `${OUT}/01-closed.png` })

  // Open / close
  const state = page.locator('.tag-state')
  await page.getByRole('button', { name: 'Open container' }).click()
  await page.waitForFunction(() => document.querySelector('.tag-state')?.textContent === 'Open', null, { timeout: 60000 })
  check('opens to Open state', (await state.textContent()) === 'Open')
  check('slider at 1 when open', (await page.locator('input[type=range]').inputValue()) === '1')
  check('Open button disabled when open', await page.getByRole('button', { name: 'Open container' }).isDisabled())
  await page.screenshot({ path: `${OUT}/02-open.png` })

  // Rapid repeated clicks must not break state
  const closeBtn = page.getByRole('button', { name: 'Close container' })
  await closeBtn.click()
  await sleep(150)
  await page.getByRole('button', { name: 'Open container' }).click()
  await sleep(150)
  await closeBtn.click()
  await page.waitForFunction(() => document.querySelector('.tag-state')?.textContent === 'Closed', null, { timeout: 60000 })
  check('rapid open/close ends cleanly Closed', (await state.textContent()) === 'Closed')

  // Slider
  await page.locator('input[type=range]').fill('0.5')
  await page.waitForFunction(() => document.querySelector('.tag-state')?.textContent === 'Partly open', null, { timeout: 60000 })
  check('slider gives Partly open', true)
  await page.getByRole('button', { name: 'Close container' }).click()
  await page.waitForFunction(() => document.querySelector('.tag-state')?.textContent === 'Closed', null, { timeout: 60000 })

  // Visibility
  await page.getByRole('button', { name: 'Hide Lid' }).click()
  check('hiding lid removes its marker', (await page.locator('.marker').count()) === 4)
  await page.screenshot({ path: `${OUT}/03-lid-hidden.png` })
  check('Show all enabled when something hidden', await page.getByRole('button', { name: 'Show all' }).isEnabled())
  await page.getByRole('button', { name: 'Show all' }).click()
  check('Show all restores markers', (await page.locator('.marker').count()) === 5)

  // Selection via panel and via marker
  await page.getByRole('button', { name: 'Hinge', exact: true }).click()
  check('panel selection updates info', await page.locator('#info-title + .info-title').getByText('Hinge').isVisible())
  await page.getByRole('button', { name: 'Select Inner tray' }).click()
  check('marker selection updates info', await page.locator('#info-title + .info-title').getByText('Inner tray').isVisible())
  check('model object name reported', await page.locator('section[aria-labelledby=info-title]').getByText('InnerTray', { exact: true }).isVisible())

  // Exploded view
  const exploded = page.getByRole('button', { name: 'Exploded view' })
  await exploded.click()
  check('exploded toggle pressed', (await exploded.getAttribute('aria-pressed')) === 'true')
  await sleep(15000) // software GL renders ~1-2 fps, so give the animation time
  await page.screenshot({ path: `${OUT}/04-exploded.png` })
  await exploded.click()
  await sleep(15000)
  check('exploded toggle released', (await exploded.getAttribute('aria-pressed')) === 'false')
  await page.screenshot({ path: `${OUT}/05-restored.png` })

  // Reset camera + orbit drag + zoom shouldn't throw
  const box = await page.locator('canvas').boundingBox()
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2 - 40, { steps: 8 })
  await page.mouse.up()
  await page.mouse.wheel(0, -400)
  await page.getByRole('button', { name: 'Reset camera' }).click()
  check('camera interactions run', true)

  // Sensors
  const sensorCard = page.locator('section[aria-labelledby=sensor-title]')
  check('simulated badge', await sensorCard.locator('.badge-sim').isVisible())
  check('sensor says not connected', await sensorCard.getByText('Not connected').isVisible())
  const temp = parseFloat(await sensorCard.locator('.reading-value').first().textContent())
  check('temperature plausible', temp > 15 && temp < 32, `${temp} °C`)
  const t0 = await sensorCard.locator('.info-meta dd').nth(1).textContent()
  await sleep(3000)
  const t1 = await sensorCard.locator('.info-meta dd').nth(1).textContent()
  check('timestamp updates', t0 !== t1, `${t0} -> ${t1}`)
  await sensorCard.getByLabel('Simulated feed').uncheck()
  await sensorCard.locator('.badge-off').waitFor({ timeout: 10000 }).catch(() => {})
  check('feed off shows Unavailable', await sensorCard.locator('.badge-off').isVisible())
  await sensorCard.getByLabel('Simulated feed').check()

  // Mobile layout (close the desktop page first: software GL is CPU-bound)
  await page.close()
  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true })
  await mobile.goto(URL)
  await mobile.waitForSelector('.marker', { timeout: 60000 })
  await sleep(500)
  const overflow = await mobile.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  check('no horizontal scroll at 390px', overflow <= 0, `overflow ${overflow}px`)
  await mobile.screenshot({ path: `${OUT}/06-mobile.png`, fullPage: true })

  check('no console/page errors', errors.length === 0, errors.slice(0, 3).join(' | '))
  await browser.close()
} catch (err) {
  console.error('FAIL  script error —', err.message)
  results.push(false)
} finally {
  server.kill()
}

const failed = results.filter((r) => !r).length
console.log(`\n${results.length - failed}/${results.length} checks passed`)
process.exit(failed ? 1 : 0)
