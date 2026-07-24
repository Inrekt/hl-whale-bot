// Headless-Chromium renderer: HTML → PNG (cards) and HTML → PDF (daily report).
// One shared browser instance; pages are opened per render and closed.

import puppeteer, { type Browser } from 'puppeteer'

const CARD_WIDTH_PX = 560
const RENDER_TIMEOUT_MS = 30_000

let browserPromise: Promise<Browser> | null = null

async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--force-color-profile=srgb'],
    })
  }
  return browserPromise
}

export async function closeBrowser(): Promise<void> {
  if (!browserPromise) return
  const browser = await browserPromise
  browserPromise = null
  await browser.close()
}

export async function renderCardPng(html: string): Promise<Buffer> {
  const browser = await getBrowser()
  const page = await browser.newPage()
  try {
    await page.setViewport({ width: CARD_WIDTH_PX, height: 600, deviceScaleFactor: 2 })
    await page.setContent(html, { waitUntil: 'load', timeout: RENDER_TIMEOUT_MS })
    const card = await page.$('#card')
    if (!card) throw new Error('card template has no #card element')
    const shot = await card.screenshot({ type: 'png' })
    return Buffer.from(shot)
  } finally {
    await page.close()
  }
}

export async function renderPdf(html: string): Promise<Buffer> {
  const browser = await getBrowser()
  const page = await browser.newPage()
  try {
    await page.setContent(html, { waitUntil: 'load', timeout: RENDER_TIMEOUT_MS })
    const pdf = await page.pdf({
      format: 'a4',
      printBackground: true,
      margin: { top: '14mm', bottom: '14mm', left: '12mm', right: '12mm' },
    })
    return Buffer.from(pdf)
  } finally {
    await page.close()
  }
}
