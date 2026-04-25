export function normalizeCronExpression(expr) {
  const text = String(expr || '').trim()
  if (!text) throw new Error('cron 表达式为空')
  const parts = text.split(/\s+/)
  if (parts.length === 5) return `0 ${text}`
  if (parts.length === 6) return text
  throw new Error(`cron 表达式需要 5 或 6 段，当前 ${parts.length} 段`)
}
