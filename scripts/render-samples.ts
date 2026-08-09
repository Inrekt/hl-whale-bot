// Renders every card type + the PDF from live data into --out dir (visual QA).
// Usage: npx tsx scripts/render-samples.ts --out /tmp/samples [--leaderboard cached.json]

import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fetchLeaderboard } from '../src/hl.js'
import { buildSnapshot, coinSkews, pickUniverse } from '../src/scan.js'
import {
  coinCardHtml,
  leaderboardCardHtml,
  liquidationCardHtml,
  sentimentCardHtml,
  topWhalesCardHtml,
} from '../src/render/cards.js'
import { closeBrowser, renderCardPng, renderPdf } from '../src/render/render.js'
import { reportFileName, reportHtml } from '../src/report.js'

const SAMPLE_UNIVERSE = 80

function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag)
  return index === -1 ? undefined : process.argv[index + 1]
}

const outDir = argValue('--out') ?? 'samples'
await mkdir(outDir, { recursive: true })

const rows = await fetchLeaderboard(argValue('--leaderboard'))
const snapshot = await buildSnapshot(pickUniverse(rows).slice(0, SAMPLE_UNIVERSE))
console.log(`${snapshot.positions.length} positions ≥ $1M`)

const topCoin = coinSkews(snapshot)[0]?.coin ?? 'BTC'
const outputs: Array<[string, Buffer]> = [
  ['card-top.png', await renderCardPng(topWhalesCardHtml(snapshot, 0))],
  [`card-coin-${topCoin}.png`, await renderCardPng(coinCardHtml(snapshot, topCoin, 2))],
  [`card-liq-${topCoin}.png`, await renderCardPng(liquidationCardHtml(snapshot, topCoin, 2))],
  ['card-sentiment.png', await renderCardPng(sentimentCardHtml(snapshot, 0))],
  ['card-leaderboard.png', await renderCardPng(leaderboardCardHtml(rows))],
  [reportFileName(), await renderPdf(reportHtml(snapshot))],
]
for (const [name, buffer] of outputs) {
  const path = join(outDir, name)
  await writeFile(path, buffer)
  console.log(`${path}  ${(buffer.length / 1024).toFixed(1)} KB`)
}
await closeBrowser()
