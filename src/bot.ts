// Telegram bot wiring: menu screens, per-coin cards, whale watchlist, PDF report.
// Navigation mirrors the reference bot: one UI message edited in place;
// when message kind changes (text↔photo) the old one is replaced.

import { Bot, Context, GrammyError, InlineKeyboard, InputFile } from 'grammy'
import { configuredOwner, decideAccess } from './access.js'
import type { BotState } from './state.js'
import { SnapshotService } from './snapshot.js'
import {
  coinCardHtml,
  leaderboardCardHtml,
  liquidationCardHtml,
  sentimentCardHtml,
  topWhalesCardHtml,
} from './render/cards.js'
import { buildCoinView, encodeCoinView, parseCoinView, type CoinFilter, type CoinView } from './coinView.js'
import { deltaAgainst, mskDay, type SkewDelta } from './history.js'
import { nameOf, sanitizeWhaleName } from './whales.js'
import { resolveCoin } from './scan.js'
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
/** chat id → адрес кита, которому владелец сейчас придумывает имя */
const pendingRename = new Map<number, string>()

function mainMenuKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('🐳 Топ китов', 'top')
    .text('📊 Настроение', 'sentiment')
    .row()
    .text('🔎 По монете', 'coins')
    .text('🏆 Лидерборд', 'leaderboard')
    .row()
    .text('⭐ Избранные киты', 'watch')
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

/** Сетка выбора монеты — используется как есть только экраном ликвидаций. */
function coinKeyboard(coins: readonly string[], current: string): InlineKeyboard {
  const keyboard = new InlineKeyboard()
  coins.forEach((coin, index) => {
    keyboard.text(coin === current ? `· ${coin} ·` : coin, `coin:${coin}`)
    if (index % 3 === 2) keyboard.row()
  })
  if (coins.length % 3 !== 0) keyboard.row()
  return keyboard.text(`🎯 Ликвидации ${current}`, `liq:${current}`).row().text('🐳 Топ', 'top').text('‹ Меню', 'menu')
}

const FILTER_BUTTON_LABEL: Readonly<Record<CoinFilter, string>> = { all: 'Все', long: 'Лонги', short: 'Шорты' }

/**
 * Клавиатура карточки монеты: ряд фильтров, ряд листания (только когда есть
 * что листать), сетка монет 4 в ряд — вместо 3, как у coinKeyboard, — чтобы
 * добавленные два ряда не подняли общую высоту клавиатуры выше нынешней.
 */
function coinViewKeyboard(coins: readonly string[], view: CoinView): InlineKeyboard {
  const keyboard = new InlineKeyboard()
  const counts: Readonly<Record<CoinFilter, number>> = {
    all: view.coinTotal,
    long: view.longCount,
    short: view.shortCount,
  }
  for (const filter of ['all', 'long', 'short'] as const) {
    const label = `${filter === view.filter ? '· ' : ''}${FILTER_BUTTON_LABEL[filter]} ${counts[filter]}${filter === view.filter ? ' ·' : ''}`
    const data = filter === view.filter ? 'noop' : encodeCoinView(view.coin, filter, 1)
    keyboard.text(label, data)
  }
  keyboard.row()

  if (view.pageCount > 1) {
    const prevData = view.page > 1 ? encodeCoinView(view.coin, view.filter, view.page - 1) : 'noop'
    const nextData = view.page < view.pageCount ? encodeCoinView(view.coin, view.filter, view.page + 1) : 'noop'
    keyboard
      .text(view.page > 1 ? '‹' : '·', prevData)
      .text(`${view.page}/${view.pageCount}`, 'noop')
      .text(view.page < view.pageCount ? '›' : '·', nextData)
      .row()
  }

  coins.forEach((coin, index) => {
    keyboard.text(coin === view.coin ? `· ${coin} ·` : coin, `coin:${coin}`)
    if (index % 4 === 3) keyboard.row()
  })
  if (coins.length % 4 !== 0) keyboard.row()
  return keyboard
    .text(`🎯 Ликвидации ${view.coin}`, `liq:${view.coin}`)
    .row()
    .text('🐳 Топ', 'top')
    .text('‹ Меню', 'menu')
}

function backKeyboard(): InlineKeyboard {
  return new InlineKeyboard().text('‹ Меню', 'menu')
}

function watchKeyboard(watched: readonly string[], names: Readonly<Record<string, string>>): InlineKeyboard {
  const keyboard = new InlineKeyboard().text('➕ Добавить кита', 'watch:add').row()
  for (const address of watched) {
    keyboard
      .text(`✏️ ${nameOf(address, names)}`, `watch:rename:${address}`)
      .text('❌', `watch:del:${address}`)
      .row()
  }
  return keyboard.text('‹ Меню', 'menu')
}

/** Правда только для безобидного «редактирование ничего не изменило». */
function isNotModifiedError(error: unknown): boolean {
  return error instanceof GrammyError && error.description.includes('message is not modified')
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
    } catch (error) {
      // Идентичный контент — не поломка: карточка уже показывает то, что нужно,
      // удалять и слать заново значит зря прыгнуть сообщением в конец чата.
      if (isNotModifiedError(error)) return
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
      const png = await renderCardPng(topWhalesCardHtml(snapshots.current(), snapshots.ageMinutes(), state.whaleNames))
      return { kind: 'photo', png, caption: '🐳 Топ китов · Hyperliquid', keyboard: cardNavKeyboard() }
    },
    async sentiment(): Promise<Screen> {
      const png = await renderCardPng(sentimentCardHtml(snapshots.current(), snapshots.ageMinutes(), todayDelta()))
      return { kind: 'photo', png, caption: '📊 Настроение умных денег', keyboard: cardNavKeyboard() }
    },
    async leaderboard(): Promise<Screen> {
      const png = await renderCardPng(leaderboardCardHtml(snapshots.leaderboardRows()))
      return { kind: 'photo', png, caption: '🏆 Лучшие трейдеры Hyperliquid', keyboard: cardNavKeyboard() }
    },
    async coin(coin: string, filter: CoinFilter = 'all', page = 1): Promise<Screen> {
      // Строится один раз и переиспользуется для клавиатуры и подписи — тот же
      // просчёт, что и внутри coinCardHtml (O(n) по ≤600 позициям), но так не
      // нужно тащить CoinView через публичный API рендера и ломать render-samples.
      const view = buildCoinView(snapshots.current().positions, coin, filter, page)
      const png = await renderCardPng(
        coinCardHtml(snapshots.current(), coin, snapshots.ageMinutes(), todayDelta(), state.whaleNames, {
          filter,
          page,
        }),
      )
      return {
        kind: 'photo',
        png,
        caption: texts.coinCaption(coin, view.filter, view.page, view.pageCount),
        keyboard: coinViewKeyboard(snapshots.topCoins(), view),
      }
    },
    async liquidation(coin: string): Promise<Screen> {
      const png = await renderCardPng(liquidationCardHtml(snapshots.current(), coin, snapshots.ageMinutes()))
      return {
        kind: 'photo',
        png,
        caption: `🎯 ${coin} · карта ликвидаций`,
        keyboard: coinKeyboard(snapshots.topCoins(), coin),
      }
    },
  }

  /** Насколько перекос сдвинулся против прошлых суток — для подписи «+34 за сутки». */
  function todayDelta(): SkewDelta {
    return deltaAgainst(state.history, snapshots.current(), mskDay(new Date()))
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

  bot.callbackQuery(/^liq:(.+)$/, async (ctx) => {
    if (!(await guardReady(ctx))) return
    await ctx.answerCallbackQuery()
    await showScreen(ctx, await screens.liquidation(ctx.match[1] ?? ''))
  })

  // Нажатие на уже активный фильтр/страницу/недоступную стрелку: только «принято»,
  // без рендера и без edit — иначе Telegram ответил бы «not modified» на
  // побайтово идентичную карточку.
  bot.callbackQuery('noop', (ctx) => ctx.answerCallbackQuery())

  bot.callbackQuery(/^cv:([als])(\d{1,3}):(.+)$/, async (ctx) => {
    if (!(await guardReady(ctx))) return
    const parsed = parseCoinView(ctx.callbackQuery.data)
    if (!parsed) return ctx.answerCallbackQuery()
    await ctx.answerCallbackQuery()
    await showScreen(ctx, await screens.coin(parsed.coin, parsed.filter, parsed.page))
  })

  // Отдельный префикс `cv:` не пересекается с этим — жадный `/^coin:(.+)$/`
  // молча проглотил бы `cv:l2:SOL`, если бы формат расширял именно этот вход.
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
    await showScreen(ctx, { kind: 'text', text: texts.WATCH_INTRO, keyboard: watchKeyboard(watchedBy(chatId), state.whaleNames) })
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
    await showScreen(ctx, { kind: 'text', text: texts.WATCH_REMOVED(address), keyboard: watchKeyboard(watchedBy(chatId), state.whaleNames) })
  })

  bot.callbackQuery(/^watch:rename:(0x[0-9a-fA-F]{40})$/, async (ctx) => {
    await ctx.answerCallbackQuery()
    const chatId = ctx.chatId
    const address = ctx.match[1]
    if (chatId === undefined || address === undefined) return
    pendingRename.set(chatId, address.toLowerCase())
    await ctx.reply(texts.RENAME_ASK(address, state.whaleNames))
  })

  bot.on('message:text', async (ctx) => {
    const chatId = ctx.chatId
    const text = ctx.message.text.trim()

    const renaming = pendingRename.get(chatId)
    if (renaming !== undefined) {
      const name = sanitizeWhaleName(text)
      if (name === null) {
        await ctx.reply(texts.RENAME_BAD)
        return
      }
      pendingRename.delete(chatId)
      state.whaleNames = { ...state.whaleNames, [renaming]: name }
      await persist()
      await ctx.reply(texts.RENAME_DONE(renaming, name), {
        reply_markup: watchKeyboard(watchedBy(chatId), state.whaleNames),
      })
      return
    }

    if (pendingAddress.has(chatId)) {
      if (!ADDRESS_PATTERN.test(text)) {
        await ctx.reply(texts.WATCH_BAD_ADDRESS)
        return
      }
      pendingAddress.delete(chatId)
      const address = text.toLowerCase()
      const current = watchedBy(chatId)
      if (current.some((a) => a.toLowerCase() === address)) {
        await ctx.reply(texts.WATCH_EXISTS, { reply_markup: watchKeyboard(current, state.whaleNames) })
        return
      }
      state.watchlists = { ...state.watchlists, [String(chatId)]: [...current, address] }
      await persist()
      await ctx.reply(texts.WATCH_ADDED(address, state.whaleNames), {
        reply_markup: watchKeyboard([...current, address], state.whaleNames),
      })
      return
    }

    // Per-coin slash commands (/btc /eth /hype …) against the live coin list.
    const commandMatch = /^\/([a-zA-Z0-9]{2,12})$/.exec(text)
    if (commandMatch && snapshots.isReady()) {
      const coin = resolveCoin(snapshots.current(), commandMatch[1] ?? '')
      if (coin) await showScreen(ctx, await screens.coin(coin))
    }
  })

  bot.catch((error) => console.error('bot error:', error.error))
  return bot
}
