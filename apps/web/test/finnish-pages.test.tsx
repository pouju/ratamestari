import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { FINNISH, LanguageProvider } from '../src/i18n'
import { Guides } from '../src/guides/Guides'
import { Landing } from '../src/landing/Landing'

const ENGLISH_WORDS = /\b(the|and|with|course|control|leg|your|map)\b/i

const visibleText = (html: string) =>
  html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;|&#\d+;/g, ' ')

describe('pages in Finnish', () => {
  it.each([
    ['landing', <Landing key="landing" />],
    ['guides', <Guides key="guides" />],
  ])('show no English words on the %s page', (_, page) => {
    const text = visibleText(
      renderToStaticMarkup(<LanguageProvider value={FINNISH}>{page}</LanguageProvider>),
    )
    expect(text.split(/\s{2,}/).filter(part => ENGLISH_WORDS.test(part))).toEqual([])
  })
})
