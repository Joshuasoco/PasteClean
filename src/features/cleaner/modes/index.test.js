import { describe, expect, it } from 'vitest'
import { applyFormatMode, getModeDefinition, getModes } from './index'

describe('cleaner modes', () => {
  it('falls back to plain mode definition for unknown mode ids', () => {
    const mode = getModeDefinition('does-not-exist')

    expect(mode.id).toBe('plain')
  })

  it('plain mode removes markdown structural prefixes', () => {
    const input = '# Header\n- Item\n> quote'
    const result = applyFormatMode(input, 'plain', { cleanWhitespace: true })

    expect(result.text).toBe('Header\nItem\nquote')
  })

  it('markdown mode normalizes heading spacing and bullets', () => {
    const input = '##Heading\n* one\n+ two'
    const result = applyFormatMode(input, 'markdown', { cleanWhitespace: true })

    expect(result.text).toBe('## Heading\n- one\n- two')
  })

  it('code mode removes common line-number prefixes', () => {
    const input = '10 |   const x = 1;\n11 |   return x;'
    const result = applyFormatMode(input, 'code', { cleanWhitespace: true })

    expect(result.text).toBe('  const x = 1;\n  return x;')
  })

  it('declares strategy hooks and policy flags for every mode', () => {
    for (const mode of getModes()) {
      expect(typeof mode.preprocess).toBe('function')
      expect(typeof mode.transform).toBe('function')
      expect(typeof mode.postprocess).toBe('function')
      expect(typeof mode.shouldCleanUrls).toBe('boolean')
      expect(typeof mode.shouldNormalizePunctuation).toBe('boolean')
      expect(typeof mode.shouldDecodeHtmlEntities).toBe('boolean')
    }
  })

  it('exposes distinct defaults for structured modes', () => {
    expect(getModeDefinition('code').shouldCleanUrls).toBe(false)
    expect(getModeDefinition('code').shouldNormalizePunctuation).toBe(false)
    expect(getModeDefinition('markdown').shouldNormalizePunctuation).toBe(false)
    expect(getModeDefinition('email').shouldNormalizePunctuation).toBe(true)
  })
})
