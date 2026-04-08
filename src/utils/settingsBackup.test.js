import { describe, expect, it } from 'vitest'
import { parseSettingsBackup, serializeSettingsBackup } from './settingsBackup'

describe('settingsBackup', () => {
  it('serializes expected payload shape', () => {
    const output = serializeSettingsBackup({
      cleaningOptions: { cleanWhitespace: true },
      sourcePreset: 'gmail',
      destinationPreset: 'email',
      customRules: [{ id: 'a1', find: 'foo', replace: 'bar', enabled: true }],
      sourceMemory: {
        gmail: { preferredMode: 'email', preferredDestination: 'email' },
      },
      createdAt: new Date('2026-04-03T00:00:00.000Z'),
    })

    const parsed = JSON.parse(output)
    expect(parsed.type).toBe('settings-backup')
    expect(parsed.version).toBe(2)
    expect(parsed.sourcePreset).toBe('gmail')
    expect(parsed.destinationPreset).toBe('email')
    expect(parsed.customRules).toHaveLength(1)
    expect(parsed.sourceMemory.gmail).toEqual({
      preferredMode: 'email',
      preferredDestination: 'email',
    })
  })

  it('parses and merges options with defaults', () => {
    const backup = JSON.stringify({
      sourcePreset: 'pdf',
      destinationPreset: 'docs',
      cleaningOptions: {
        cleanWhitespace: false,
        decodeHtmlEntities: true,
        unsupported: true,
      },
      customRules: [{ find: 'x', replace: 'y', enabled: true }],
      sourceMemory: {
        pdf: { preferredMode: 'plain', preferredDestination: 'docs' },
        ignored: { nope: true },
      },
    })

    const defaults = {
      cleanWhitespace: true,
      decodeHtmlEntities: false,
      removeEmoji: false,
    }

    const result = parseSettingsBackup(backup, defaults)

    expect(result.cleaningOptions).toEqual({
      cleanWhitespace: false,
      decodeHtmlEntities: true,
      removeEmoji: false,
    })
    expect(result.sourcePreset).toBe('pdf')
    expect(result.destinationPreset).toBe('docs')
    expect(result.customRules).toEqual([{ id: undefined, find: 'x', replace: 'y', enabled: true }])
    expect(result.sourceMemory).toEqual({
      pdf: { preferredMode: 'plain', preferredDestination: 'docs' },
    })
  })

  it('throws on invalid json', () => {
    expect(() => parseSettingsBackup('{bad', { cleanWhitespace: true })).toThrow('Invalid JSON file.')
  })
})
