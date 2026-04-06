import { describe, expect, it } from 'vitest'
import { parseSettingsBackup, serializeSettingsBackup } from './settingsBackup'

describe('settingsBackup', () => {
  it('serializes expected payload shape', () => {
    const output = serializeSettingsBackup({
      cleaningOptions: { cleanWhitespace: true },
      sourcePreset: 'gmail',
      customRules: [{ id: 'a1', find: 'foo', replace: 'bar', enabled: true }],
      createdAt: new Date('2026-04-03T00:00:00.000Z'),
    })

    const parsed = JSON.parse(output)
    expect(parsed.type).toBe('settings-backup')
    expect(parsed.version).toBe(1)
    expect(parsed.sourcePreset).toBe('gmail')
    expect(parsed.customRules).toHaveLength(1)
  })

  it('parses and merges options with defaults', () => {
    const backup = JSON.stringify({
      sourcePreset: 'pdf',
      cleaningOptions: {
        cleanWhitespace: false,
        decodeHtmlEntities: true,
        unsupported: true,
      },
      customRules: [{ find: 'x', replace: 'y', enabled: true }],
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
    expect(result.customRules).toEqual([{ id: undefined, find: 'x', replace: 'y', enabled: true }])
  })

  it('throws on invalid json', () => {
    expect(() => parseSettingsBackup('{bad', { cleanWhitespace: true })).toThrow('Invalid JSON file.')
  })
})
