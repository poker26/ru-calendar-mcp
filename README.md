# ru-calendar-mcp

MCP-сервер для **детерминированного** разбора русских календарных фраз и **производственного календаря РФ** (данные [isDayOff](https://www.isdayoff.ru/)).

Цель: все ваши агенты (Cursor SDK gateway, Cursor IDE, другие MCP-клиенты) одинаково понимают:

- «завтра», «послезавтра», «в понедельник»
- «на этой неделе» (сегодня + оставшиеся **рабочие** дни до конца ISO-недели)
- «на следующей неделе», «через неделю», «через 3 рабочих дня»
- рабочий / выходной / перенос / сокращённый день

**Модель не должна считать даты сама** — она вызывает tools этого MCP и использует готовые ISO.

## Tools

| Tool | Назначение |
|------|------------|
| `resolve_phrase` | Одна фраза → `{ dateFrom, dateTo, dates[], rule, dateTimeFrom, dateTimeTo }` |
| `resolve_text` | Все распознанные фразы в произвольном тексте |
| `is_workday` | Рабочий ли день по производственному календарю РФ |
| `next_workday` | N-й рабочий день после даты |
| `workdays_in_range` | Список рабочих дней в диапазоне |
| `week_range` | this / next / previous ISO-неделя (пн–вс) |
| `explain_day` | Пояснение дня (праздник, перенос, сокращённый) |
| `get_calendar_context` | Готовый текстовый блок для промпта агента |

## Правила (важное)

| Фраза | Правило |
|-------|---------|
| **сегодня** | текущий календарный день |
| **завтра** | +1 день |
| **послезавтра** | +2 дня |
| **в понедельник** (без «этот») | ближайший **будущий** понедельник; если сегодня понедельник → **+7 дней** |
| **в этот понедельник** | сегодня, если день совпадает, иначе ближайшее будущее |
| **на этой неделе** | сегодня + оставшиеся **рабочие** дни текущей ISO-недели |
| **на следующей неделе** | все **рабочие** дни следующей ISO-недели |
| **через неделю** | +7 календарных дней (**не** «следующая неделя») |

Часовой пояс по умолчанию: `Europe/Moscow` (`RU_CALENDAR_TIMEZONE`).

## Установка

```bash
git clone https://github.com/poker26/ru-calendar-mcp.git
cd ru-calendar-mcp
npm install
npm run build
npm run verify
```

Обновить bundled-календари:

```bash
npm run fetch-calendars
```

## Cursor / Claude Desktop (stdio)

```json
{
  "mcpServers": {
    "ru-calendar": {
      "command": "npx",
      "args": ["-y", "ru-calendar-mcp"]
    }
  }
}
```

Локально из репозитория:

```json
{
  "mcpServers": {
    "ru-calendar": {
      "command": "node",
      "args": ["/path/to/ru-calendar-mcp/dist/index.js"]
    }
  }
}
```

## HTTP (для Cursor SDK gateway)

```bash
RU_CALENDAR_MCP_API_KEY=your-secret
PORT=8765
npm run start:http
```

Gateway `.env`:

```env
RU_CALENDAR_MCP_URL=https://calendar.example.com/mcp
RU_CALENDAR_MCP_API_KEY=your-secret
```

## Примеры

```json
// resolve_phrase
{ "phrase": "в понедельник", "reference_iso": "2026-06-04" }
// → dateFrom: "2026-06-08" (не 2026-06-09)

// resolve_phrase
{ "phrase": "на этой неделе", "reference_iso": "2026-06-04" }
// → dates: ["2026-06-04", "2026-06-05"] (чт–пт, рабочие)

// is_workday
{ "iso_date": "2026-06-12" }
// → kind: "holiday" (если по календарю выходной)
```

## Источник календаря

- Bundled JSON: `data/calendars/ruYYYY.json` ([isdayoff/calendars](https://github.com/isdayoff/calendars))
- Fallback: API `https://isdayoff.ru/api/getdata?year=YYYY&cc=ru`

## Лицензия

MIT
