// Daily 10:00 MSK report job (runs from daily-report.yml cron).
// Idempotent per MSK date via state.lastDailyReport.

import { Bot, InputFile } from 'grammy'
import { fetchLeaderboard } from '../src/hl.js'
import { buildSnapshot, pickUniverse } from '../src/scan.js'
import { renderPdf } from '../src/render/render.js'
import { closeBrowser } from '../src/render/render.js'
import { loadState, saveState } from '../src/state.js'
import { mskDateStamp, reportCaption, reportFileName, reportHtml } from '../src/report.js'


try {
  process.loadEnvFile('.env')
} catch {
  // CI provides env directly
}

const token = process.env.BOT_TOKEN
if (!token) {
  console.error('BOT_TOKEN is not set')
  process.exit(1)
}

const state = await loadState()
const today = mskDateStamp()
if (state.lastDailyReport === today) {
  console.log(`report for ${today} already sent — nothing to do`)
  process.exit(0)
}
if (state.subscribers.length === 0) {
  console.log('no subscribers yet — skipping')
  process.exit(0)
}

console.log(`building report for ${state.subscribers.length} subscriber(s)…`)
const leaderboard = await fetchLeaderboard()
const snapshot = await buildSnapshot(pickUniverse(leaderboard))
const pdf = await renderPdf(reportHtml(snapshot))
const caption = reportCaption(snapshot)
const fileName = reportFileName()

const bot = new Bot(token)
let sent = 0
for (const chatId of state.subscribers) {
  try {
    await bot.api.sendDocument(chatId, new InputFile(pdf, fileName), { caption })
    sent += 1
  } catch (error) {
    console.error(`send to ${chatId} failed:`, error instanceof Error ? error.message : error)
  }
}

state.lastDailyReport = today
await saveState(state)
await closeBrowser()
console.log(`done: ${sent}/${state.subscribers.length} delivered`)
