import { describe, expect, it } from 'vitest'
import { applyFormatMode, getModeDefinition } from './index'

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
})
