// Telegram bot wiring: menu screens, per-coin cards, whale watchlist, PDF report.
// Navigation mirrors the reference bot: one UI message edited in place;
// when message kind changes (text↔photo) the old one is replaced.

import { Bot, Context, InlineKeyboard, InputFile } from 'grammy'
import { configuredOwner, decideAccess } from './access.js'
import type { BotState } from './state.js'
import { SnapshotService } from './snapshot.js'
import { coinCardHtml, leaderboardCardHtml, sentimentCardHtml, topWhalesCardHtml } from './render/cards.js'
import { renderCardPng, renderPdf } from './render/render.js'
import { reportCaption, reportFileName, reportHtml } from './report.js'
import { shortAddress } from './format.js'
import * as texts from './texts.js'

const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/
const MAX_WATCHED_WHALES = 10

interface BotDeps {
  readonly snapshots: SnapshotService
  readonly state: BotState
  readonly persist: () => Promise<void>
}

type Screen =
  | { kind: 'text'; text: string; keyboard: InlineKeyboard }
  | { kind: 'photo'; png: Buffer; caption: string; keyboard: InlineKeyboard }

const pendingAddress = new Set<number>()

function mainMenuKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('🐳 Топ китов', 'top')
    .text('📊 Настроение', 'sentiment')
    .row()
    .text('🔎 По монете', 'coins')
    .text('🏆 Лидерборд', 'leaderboard')
    .row()
    .text('🐙 Слежка за китом', 'watch')
    .text('📄 PDF-отчёт', 'pdf')
    .row()
    .text('🔔 Подписка', 'sub')
    .text('❓ Помощь', 'help')
}

function cardNavKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('🐳 Топ', 'top')
    .text('📊 Настроение', 'sentiment')
    .row()
    .text('🏆 Лидерборд', 'leaderboard')
    .text('🔎 Монеты', 'coins')
    .row()
    .text('‹ Меню', 'menu')
}

function coinKeyboard(coins: readonly string[]): InlineKeyboard {
  const keyboard = new InlineKeyboard()
  coins.forEach((coin, index) => {
    keyboard.text(coin, `coin:${coin}`)
    if (index % 3 === 2) keyboard.row()
  })
  if (coins.length % 3 !== 0) keyboard.row()
  return keyboard.text('🐳 Топ', 'top').row().text('‹ Меню', 'menu')
}

function backKeyboard(): InlineKeyboard {
  return new InlineKeyboard().text('‹ Меню', 'menu')
}

function watchKeyboard(watched: readonly string[]): InlineKeyboard {
  const keyboard = new InlineKeyboard().text('➕ Добавить кита', 'watch:add').row()
  for (const address of watched) {
    keyboard.text(`❌ ${shortAddress(address)}`, `watch:del:${address}`).row()
  }
  return keyboard.text('‹ Меню', 'menu')
}

/** Edit the tapped message when possible, otherwise replace it. */
async function showScreen(ctx: Context, screen: Screen): Promise<void> {
  const viaCallback = ctx.callbackQuery !== undefined
  if (viaCallback) {
    try {
      if (screen.kind === 'text') {
        await ctx.editMessageText(screen.text, { reply_markup: screen.keyboard })
      } else {
        await ctx.editMessageMedia(
          { type: 'photo', media: new InputFile(screen.png, 'card.png'), caption: screen.caption },
          { reply_markup: screen.keyboard },
        )
      }
      return
    } catch {
      await ctx.deleteMessage().catch(() => undefined)
    }
  }
  if (screen.kind === 'text') {
    await ctx.reply(screen.text, { reply_markup: screen.keyboard })
  } else {
    await ctx.replyWithPhoto(new InputFile(screen.png, 'card.png'), {
      caption: screen.caption,
      reply_markup: screen.keyboard,
    })
  }
}

export function createBot(token: string, deps: BotDeps): Bot {
  const { snapshots, state, persist } = deps
  const bot = new Bot(token)
  const envOwner = configuredOwner(process.env.OWNER_ID)

  bot.use(async (ctx, next) => {
    const decision = decideAccess(ctx.from?.id, envOwner ?? state.ownerId)
    if (decision === 'deny') return
    if (decision === 'claim' && ctx.from) {
      state.ownerId = ctx.from.id
      await persist()
    }
    await next()
  })

  const screens = {
    async top(): Promise<Screen> {
      const png = await renderCardPng(topWhalesCardHtml(snapshots.current(), snapshots.ageMinutes()))
      return { kind: 'photo', png, caption: '🐳 Топ китов · Hyperliquid', keyboard: cardNavKeyboard() }
    },
    async sentiment(): Promise<Screen> {
      const png = await renderCardPng(sentimentCardHtml(snapshots.current(), snapshots.ageMinutes()))
      return { kind: 'photo', png, caption: '📊 Настроение умных денег', keyboard: cardNavKeyboard() }
    },
    async leaderboard(): Promise<Screen> {
      const png = await renderCardPng(leaderboardCardHtml(snapshots.leaderboardRows()))
      return { kind: 'photo', png, caption: '🏆 Лучшие трейдеры Hyperliquid', keyboard: cardNavKeyboard() }
    },
    async coin(coin: string): Promise<Screen> {
      const png = await renderCardPng(coinCardHtml(snapshots.current(), coin, snapshots.ageMinutes()))
      return { kind: 'photo', png, caption: `🔎 ${coin} · киты`, keyboard: coinKeyboard(snapshots.topCoins()) }
    },
  }

  async function guardReady(ctx: Context): Promise<boolean> {
    if (snapshots.isReady()) return true
    if (ctx.callbackQuery) await ctx.answerCallbackQuery({ text: texts.NOT_READY })
    else await ctx.reply(texts.NOT_READY)
    return false
  }

  async function sendFreshReport(ctx: Context): Promise<void> {
    await ctx.reply(texts.PDF_PREPARING, { reply_markup: backKeyboard() })
    await snapshots.refresh()
    const snapshot = snapshots.current()
    const pdf = await renderPdf(reportHtml(snapshot))
    await ctx.replyWithDocument(new InputFile(pdf, reportFileName()), { caption: reportCaption(snapshot) })
  }

  function watchedBy(chatId: number): string[] {
    return state.watchlists[String(chatId)] ?? []
  }

  bot.command('start', async (ctx) => {
    if (!state.subscribers.includes(ctx.chatId)) {
      state.subscribers = [...state.subscribers, ctx.chatId]
      await persist()
    }
    await ctx.reply(texts.WELCOME, { reply_markup: mainMenuKeyboard() })
    if (snapshots.isReady()) await showScreen(ctx, await screens.top())
  })

  bot.command('menu', (ctx) => ctx.reply(texts.MENU_TITLE, { reply_markup: mainMenuKeyboard() }))
  bot.command('help', (ctx) => ctx.reply(texts.HELP, { reply_markup: backKeyboard() }))

  bot.command('stop', async (ctx) => {
    state.subscribers = state.subscribers.filter((id) => id !== ctx.chatId)
    await persist()
    await ctx.reply(texts.UNSUBSCRIBED, { reply_markup: backKeyboard() })
  })

  bot.command('whales', async (ctx) => {
    if (await guardReady(ctx)) await sendFreshReport(ctx)
  })

  bot.callbackQuery('menu', async (ctx) => {
    await ctx.answerCallbackQuery()
    await showScreen(ctx, { kind: 'text', text: texts.MENU_TITLE, keyboard: mainMenuKeyboard() })
  })

  bot.callbackQuery('help', async (ctx) => {
    await ctx.answerCallbackQuery()
    await showScreen(ctx, { kind: 'text', text: texts.HELP, keyboard: backKeyboard() })
  })

  for (const name of ['top', 'sentiment', 'leaderboard'] as const) {
    bot.callbackQuery(name, async (ctx) => {
      if (!(await guardReady(ctx))) return
      await ctx.answerCallbackQuery()
      await showScreen(ctx, await screens[name]())
    })
  }

  bot.callbackQuery('coins', async (ctx) => {
    if (!(await guardReady(ctx))) return
    await ctx.answerCallbackQuery()
    const firstCoin = snapshots.topCoins()[0]
    if (firstCoin) await showScreen(ctx, await screens.coin(firstCoin))
  })

  bot.callbackQuery(/^coin:(.+)$/, async (ctx) => {
    if (!(await guardReady(ctx))) return
    await ctx.answerCallbackQuery()
    await showScreen(ctx, await screens.coin(ctx.match[1] ?? ''))
  })

  bot.callbackQuery('sub', async (ctx) => {
    await ctx.answerCallbackQuery()
    const chatId = ctx.chatId
    if (chatId === undefined) return
    const isSubscribed = state.subscribers.includes(chatId)
    state.subscribers = isSubscribed
      ? state.subscribers.filter((id) => id !== chatId)
      : [...state.subscribers, chatId]
    await persist()
    await showScreen(ctx, {
      kind: 'text',
      text: isSubscribed ? texts.UNSUBSCRIBED : texts.SUBSCRIBED,
      keyboard: backKeyboard(),
    })
  })

  bot.callbackQuery('pdf', async (ctx) => {
    if (!(await guardReady(ctx))) return
    await ctx.answerCallbackQuery()
    await sendFreshReport(ctx)
  })

  bot.callbackQuery('watch', async (ctx) => {
    await ctx.answerCallbackQuery()
    const chatId = ctx.chatId
    if (chatId === undefined) return
    await showScreen(ctx, { kind: 'text', text: texts.WATCH_INTRO, keyboard: watchKeyboard(watchedBy(chatId)) })
  })

  bot.callbackQuery('watch:add', async (ctx) => {
    await ctx.answerCallbackQuery()
    const chatId = ctx.chatId
    if (chatId === undefined) return
    if (watchedBy(chatId).length >= MAX_WATCHED_WHALES) {
      await ctx.reply(texts.WATCH_LIMIT)
      return
    }
    pendingAddress.add(chatId)
    await ctx.reply(texts.WATCH_ASK_ADDRESS)
  })

  bot.callbackQuery(/^watch:del:(0x[0-9a-fA-F]{40})$/, async (ctx) => {
    await ctx.answerCallbackQuery()
    const chatId = ctx.chatId
    const address = ctx.match[1]
    if (chatId === undefined || address === undefined) return
    state.watchlists = {
      ...state.watchlists,
      [String(chatId)]: watchedBy(chatId).filter((a) => a.toLowerCase() !== address.toLowerCase()),
    }
    await persist()
    await showScreen(ctx, { kind: 'text', text: texts.WATCH_REMOVED(address), keyboard: watchKeyboard(watchedBy(chatId)) })
  })

  bot.on('message:text', async (ctx) => {
    const chatId = ctx.chatId
    const text = ctx.message.text.trim()

    if (pendingAddress.has(chatId)) {
      if (!ADDRESS_PATTERN.test(text)) {
        await ctx.reply(texts.WATCH_BAD_ADDRESS)
        return
      }
      pendingAddress.delete(chatId)
      const address = text.toLowerCase()
      const current = watchedBy(chatId)
      if (current.some((a) => a.toLowerCase() === address)) {
        await ctx.reply(texts.WATCH_EXISTS, { reply_markup: watchKeyboard(current) })
        return
      }
      state.watchlists = { ...state.watchlists, [String(chatId)]: [...current, address] }
      await persist()
      await ctx.reply(texts.WATCH_ADDED(address), { reply_markup: watchKeyboard([...current, address]) })
      return
    }

    // Per-coin slash commands (/btc /eth /hype …) against the live coin list.
    const commandMatch = /^\/([a-zA-Z0-9]{2,12})$/.exec(text)
    if (commandMatch && snapshots.isReady()) {
      const requested = (commandMatch[1] ?? '').toUpperCase()
      const known = new Set(snapshots.current().positions.map((p) => p.coin.toUpperCase()))
      if (known.has(requested)) await showScreen(ctx, await screens.coin(requested))
    }
  })

  bot.catch((error) => console.error('bot error:', error.error))
  return bot
}
