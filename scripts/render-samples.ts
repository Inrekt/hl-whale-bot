// Renders every card type + the PDF from live data into --out dir (visual QA).
// Usage: npx tsx scripts/render-samples.ts --out /tmp/samples [--leaderboard cached.json]

import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fetchLeaderboard } from '../src/hl.js'
import { buildSnapshot, coinSkews, pickUniverse } from '../src/scan.js'
import { buildCoinView } from '../src/coinView.js'
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

// Живые кандидаты для проверки фильтра/листалки: монета с одиноким лонгом,
// монета без единого лонга, монета с более чем одной страницей.
const allCoins = [...new Set(snapshot.positions.map((p) => p.coin))]
const views = new Map(allCoins.map((coin) => [coin, buildCoinView(snapshot.positions, coin, 'all', 1)]))
const lonelyLongCoin = allCoins.find((c) => (views.get(c)?.longCount ?? 0) === 1)
const noLongCoin = allCoins.find((c) => (views.get(c)?.longCount ?? 0) === 0 && (views.get(c)?.shortCount ?? 0) > 0)
const multiPageCoin = [...views.entries()].sort((a, b) => b[1].pageCount - a[1].pageCount)[0]?.[0]

const outputs: Array<[string, Buffer]> = [
  ['card-top.png', await renderCardPng(topWhalesCardHtml(snapshot, 0))],
  [`card-coin-${topCoin}.png`, await renderCardPng(coinCardHtml(snapshot, topCoin, 2))],
  [`card-liq-${topCoin}.png`, await renderCardPng(liquidationCardHtml(snapshot, topCoin, 2))],
  ['card-sentiment.png', await renderCardPng(sentimentCardHtml(snapshot, 0))],
  ['card-leaderboard.png', await renderCardPng(leaderboardCardHtml(rows))],
  [reportFileName(), await renderPdf(reportHtml(snapshot))],
]

if (lonelyLongCoin) {
  outputs.push([
    `card-coin-${lonelyLongCoin}-longs.png`,
    await renderCardPng(coinCardHtml(snapshot, lonelyLongCoin, 2, undefined, {}, { filter: 'long' })),
  ])
} else {
  console.log('нет монеты с ровно одним лонгом в этом снимке — образец пропущен')
}

if (noLongCoin) {
  outputs.push([
    `card-coin-${noLongCoin}-longs-empty.png`,
    await renderCardPng(coinCardHtml(snapshot, noLongCoin, 2, undefined, {}, { filter: 'long' })),
  ])
} else {
  console.log('нет монеты без лонгов в этом снимке — образец пропущен')
}

if (multiPageCoin && (views.get(multiPageCoin)?.pageCount ?? 1) > 1) {
  outputs.push([
    `card-coin-${multiPageCoin}-page2.png`,
    await renderCardPng(coinCardHtml(snapshot, multiPageCoin, 2, undefined, {}, { filter: 'all', page: 2 })),
  ])
} else {
  console.log('нет монеты с больше чем одной страницей в этом снимке — образец пропущен')
}
for (const [name, buffer] of outputs) {
  const path = join(outDir, name)
  await writeFile(path, buffer)
  console.log(`${path}  ${(buffer.length / 1024).toFixed(1)} KB`)
}
await closeBrowser()
