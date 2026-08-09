#!/usr/bin/env bash
# Перезапуск бота на новом токене: проверка → .env → секрет репозитория →
# архив старых подписчиков и обнуление состояния → включение и старт цепочки.
#
# Usage: scripts/relaunch-bot.sh <TOKEN>
#        echo <TOKEN> | scripts/relaunch-bot.sh
set -euo pipefail

REPO="Inrekt/hl-whale-bot"
cd "$(dirname "$0")/.."

TOKEN="${1:-}"
if [ -z "$TOKEN" ]; then
  read -r TOKEN
fi
TOKEN="$(printf '%s' "$TOKEN" | tr -d '[:space:]')"
if [ -z "$TOKEN" ]; then
  echo "Токен не передан. Usage: scripts/relaunch-bot.sh <TOKEN>" >&2
  exit 1
fi

echo "1/5 Проверяю токен…"
ME="$(curl -sS --max-time 20 "https://api.telegram.org/bot${TOKEN}/getMe")"
if ! printf '%s' "$ME" | grep -q '"ok":true'; then
  echo "Токен не принят Telegram: $(printf '%s' "$ME" | sed 's/.*"description":"\([^"]*\)".*/\1/')" >&2
  exit 1
fi
USERNAME="$(printf '%s' "$ME" | sed 's/.*"username":"\([^"]*\)".*/\1/')"
echo "    ок: @${USERNAME}"

echo "2/5 Пишу .env…"
printf 'BOT_TOKEN=%s\n' "$TOKEN" > .env

echo "3/5 Ставлю секрет ${REPO}…"
printf '%s' "$TOKEN" | gh secret set BOT_TOKEN -R "$REPO"

echo "4/5 Архивирую подписчиков старого бота и обнуляю состояние…"
git fetch -q origin state
rm -rf .state-relaunch
git worktree add -q --detach .state-relaunch origin/state
(
  cd .state-relaunch
  STAMP="$(date -u +%Y-%m-%d)"
  if [ -f bot-state.json ]; then
    cp bot-state.json "subscribers-archive-${STAMP}.json"
    echo "    старый список сохранён в state:subscribers-archive-${STAMP}.json"
  fi
  printf '{"subscribers":[],"watchlists":{},"lastDailyReport":""}\n' > bot-state.json
  git add -A
  git -c user.name="whale-bot" -c user.email="whale-bot@users.noreply.github.com" \
    commit -q -m "state: reset for @${USERNAME} (previous bot deleted with its owner account)"
  git push -q --force origin HEAD:state
)
git worktree remove --force .state-relaunch

echo "5/5 Включаю workflow и стартую цепочку…"
gh workflow enable bot-runner -R "$REPO"
gh workflow run bot-runner -R "$REPO"

echo
echo "Готово. Бот @${USERNAME} поднимается — первая карточка будет через ~3 минуты."
echo "Напиши ему /start, чтобы подписаться на ежедневный отчёт."
