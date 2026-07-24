export function formatDate(dateString: string | null | undefined): string {
  if (!dateString) return '—'
  const date = new Date(`${dateString.slice(0, 10)}T00:00:00`)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export function formatCurrency(amount: number | string | null | undefined): string {
  if (amount === null || amount === undefined || amount === '') return '—'
  const value = Number(amount)
  if (Number.isNaN(value)) return '—'
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  })
}

export function formatEmrScore(score: number | string | null | undefined): string {
  if (score === null || score === undefined || score === '') return '—'
  const value = Number(score)
  return Number.isNaN(value) ? '—' : value.toFixed(2)
}
