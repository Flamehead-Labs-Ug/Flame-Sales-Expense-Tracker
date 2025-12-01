const PRIMARY_BASE_URL = 'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1'
const FALLBACK_BASE_URL = 'https://latest.currency-api.pages.dev/v1'

// Simple in-memory cache for exchange rates by base currency code.
// This lives in the server runtime and will be reset on redeploy.
const ratesCache = new Map<string, { rates: Record<string, number>; timestamp: number }>()
const CACHE_TTL_MS = 1000 * 60 * 60 // 1 hour

async function fetchRates(baseCurrency: string): Promise<Record<string, number>> {
  const base = baseCurrency.toLowerCase()
  const now = Date.now()
  const cached = ratesCache.get(base)

  if (cached && now - cached.timestamp < CACHE_TTL_MS) {
    return cached.rates
  }

  const path = `/currencies/${base}.json`

  async function fetchFrom(urlBase: string) {
    const res = await fetch(`${urlBase}${path}`)
    if (!res.ok) {
      throw new Error(`Failed to fetch rates from ${urlBase}: ${res.status}`)
    }
    return res.json() as Promise<any>
  }

  let data: any
  try {
    data = await fetchFrom(PRIMARY_BASE_URL)
  } catch (primaryError) {
    try {
      data = await fetchFrom(FALLBACK_BASE_URL)
    } catch (fallbackError) {
      // Re-throw the primary error with fallback info for logging upstream
      throw new Error(
        `Currency API failed for base ${base}: primary=${(primaryError as Error).message}, fallback=${(fallbackError as Error).message}`,
      )
    }
  }

  const rates = (data && data[base]) as Record<string, number> | undefined
  if (!rates) {
    throw new Error(`Unexpected currency API response structure for base ${base}`)
  }

  ratesCache.set(base, { rates, timestamp: now })
  return rates
}

/**
 * Convert a numeric amount from one currency to another using the Fawaz currency API.
 * If from === to or amount is 0/NaN, the original amount is returned.
 */
export async function convertAmount(
  amount: number,
  fromCurrency: string | null | undefined,
  toCurrency: string | null | undefined,
): Promise<number> {
  const value = typeof amount === 'number' ? amount : Number(amount || 0)
  if (!value) return 0

  const from = (fromCurrency || '').toLowerCase()
  const to = (toCurrency || '').toLowerCase()

  if (!from || !to || from === to) {
    return value
  }

  const rates = await fetchRates(from)
  const rate = rates[to]
  if (!rate || typeof rate !== 'number') {
    throw new Error(`Missing FX rate from ${from} to ${to}`)
  }

  return value * rate
}
