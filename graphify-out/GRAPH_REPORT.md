# Graph Report - hl-whale-bot  (2026-07-28)

## Corpus Check
- 23 files · ~7,957 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 190 nodes · 425 edges · 10 communities (9 shown, 1 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 5 edges (avg confidence: 0.62)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `447009fc`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- cards.ts
- main.ts
- scan.ts
- package.json
- daily-report.ts
- compilerOptions
- SnapshotService
- bot.ts
- hl-whale-bot
- push-state.sh

## God Nodes (most connected - your core abstractions)
1. `SnapshotService` - 15 edges
2. `shortAddress()` - 14 edges
3. `reportHtml()` - 14 edges
4. `usdCompact()` - 13 edges
5. `skewPercent()` - 13 edges
6. `sentimentCardHtml()` - 12 edges
7. `coinSkews()` - 11 edges
8. `positionRow()` - 9 edges
9. `compilerOptions` - 9 edges
10. `priceCompact()` - 8 edges

## Surprising Connections (you probably didn't know these)
- `evaluate()` --calls--> `skewPercent()`  [EXTRACTED]
  scripts/threshold.ts → src/scan.ts
- `evaluate()` --calls--> `skewPercent()`  [EXTRACTED]
  scripts/calibrate.ts → src/scan.ts
- `WATCH_ADDED()` --calls--> `shortAddress()`  [EXTRACTED]
  src/texts.ts → src/format.ts
- `WATCH_REMOVED()` --calls--> `shortAddress()`  [EXTRACTED]
  src/texts.ts → src/format.ts
- `diffPositions()` --indirect_call--> `position()`  [INFERRED]
  src/watch.ts → src/scan.test.ts

## Import Cycles
- None detected.

## Communities (10 total, 1 thin omitted)

### Community 0 - "cards.ts"
Cohesion: 0.18
Nodes (29): elapsedSec, longUsd, shortUsd, skew, startedAt, universe, priceCompact(), shortAddress() (+21 more)

### Community 1 - "main.ts"
Cohesion: 0.09
Nodes (27): bot, execFileAsync, persist(), persistQueue, pushStateToGit(), runtimeArgIndex, shutdown(), snapshots (+19 more)

### Community 2 - "scan.ts"
Cohesion: 0.10
Nodes (27): bookOf(), candidates, evaluate(), isBalancedBook(), posByWallet, raw, RawRow, Row (+19 more)

### Community 3 - "package.json"
Cohesion: 0.08
Nodes (24): grammy, dependencies, grammy, puppeteer, devDependencies, tsx, @types/node, typescript (+16 more)

### Community 4 - "daily-report.ts"
Cohesion: 0.22
Nodes (11): bot, caption, fileName, today, outputs, closeBrowser(), getBrowser(), renderCardPng() (+3 more)

### Community 5 - "compilerOptions"
Cohesion: 0.14
Nodes (13): node, scripts/**/*.ts, src/**/*.ts, compilerOptions, module, moduleResolution, noUncheckedIndexedAccess, resolveJsonModule (+5 more)

### Community 6 - "SnapshotService"
Cohesion: 0.27
Nodes (4): LeaderboardRow, pickUniverse(), Snapshot, SnapshotService

### Community 7 - "bot.ts"
Cohesion: 0.24
Nodes (9): backKeyboard(), BotDeps, createBot(), mainMenuKeyboard(), pendingAddress, Screen, showScreen(), watchKeyboard() (+1 more)

### Community 8 - "hl-whale-bot"
Cohesion: 0.25
Nodes (7): hl-whale-bot, В GitHub Actions (без сервера), Возможности, Дисклеймер, Как запустить, Как устроено, Локально

## Knowledge Gaps
- **71 isolated node(s):** `name`, `version`, `private`, `type`, `node` (+66 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `SnapshotService` connect `SnapshotService` to `main.ts`, `bot.ts`?**
  _High betweenness centrality (0.049) - this node is a cross-community bridge._
- **Why does `skewPercent()` connect `scan.ts` to `cards.ts`?**
  _High betweenness centrality (0.028) - this node is a cross-community bridge._
- **Why does `shortAddress()` connect `cards.ts` to `main.ts`, `bot.ts`?**
  _High betweenness centrality (0.022) - this node is a cross-community bridge._
- **What connects `name`, `version`, `private` to the rest of the system?**
  _71 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `main.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.0944741532976827 - nodes in this community are weakly interconnected._
- **Should `scan.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.09848484848484848 - nodes in this community are weakly interconnected._
- **Should `package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.08 - nodes in this community are weakly interconnected._