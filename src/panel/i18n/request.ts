import { getRequestConfig } from 'next-intl/server'
import { cookies } from 'next/headers'
import { defaultLocale, locales, type Locale } from './config'

export default getRequestConfig(async () => {
  const store = await cookies()
  const cookie = store.get('NEXT_LOCALE')?.value
  const locale: Locale =
    cookie && (locales as readonly string[]).includes(cookie) ? (cookie as Locale) : defaultLocale

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default
  }
})
