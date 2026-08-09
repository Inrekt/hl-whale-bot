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
  # `read` возвращает 1 на EOF без перевода строки, хотя переменную уже заполнил,
  # поэтому под `set -e` глушим код возврата и проверяем результат ниже.
  IFS= read -r TOKEN || true
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

# Состояние обнуляем начисто: список подписчиков старого бота новому боту
# бесполезен (написать можно только тем, кто сам нажал /start), а репозиторий
# публичный — чужим telegram id в нём не место.
echo "4/5 Обнуляю состояние…"
git fetch -q origin state
rm -rf .state-relaunch
git worktree add -q --detach .state-relaunch origin/state
(
  cd .state-relaunch
  printf '{"ownerId":null,"subscribers":[],"watchlists":{},"lastDailyReport":""}\n' > bot-state.json
  git add -A
  git -c user.name="whale-bot" -c user.email="whale-bot@users.noreply.github.com" \
    commit -q --amend -m "state: reset for @${USERNAME}"
  git push -q --force origin HEAD:state
)
git worktree remove --force .state-relaunch

echo "5/5 Включаю workflow и стартую цепочку…"
gh workflow enable bot-runner -R "$REPO"
gh workflow run bot-runner -R "$REPO"

echo
echo "Готово. Бот @${USERNAME} поднимается — первая карточка будет через ~3 минуты."
echo "ВАЖНО: напиши ему /start ПЕРВЫМ — кто написал первым, тот и владелец;"
echo "всем остальным бот молча не отвечает."
