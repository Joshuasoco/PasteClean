const SETTINGS_BACKUP_VERSION = 1

function sanitizeCustomRules(customRules) {
  if (!Array.isArray(customRules)) {
    return []
  }

  return customRules
    .map((rule) => {
      const find = typeof rule?.find === 'string' ? rule.find.trim() : ''

      if (!find) {
        return null
      }

      return {
        id: typeof rule.id === 'string' && rule.id ? rule.id : undefined,
        find,
        replace: typeof rule.replace === 'string' ? rule.replace : '',
        enabled: rule?.enabled !== false,
      }
    })
    .filter(Boolean)
}

export function serializeSettingsBackup({ cleaningOptions, customRules, createdAt = new Date() }) {
  const exportedAt = createdAt.toISOString()
  const payload = {
    app: 'PasteClean',
    type: 'settings-backup',
    version: SETTINGS_BACKUP_VERSION,
    exportedAt,
    cleaningOptions: { ...(cleaningOptions ?? {}) },
    customRules: sanitizeCustomRules(customRules),
  }

  return JSON.stringify(payload, null, 2)
}

export function parseSettingsBackup(rawValue, defaultCleaningOptions) {
  const fallbackOptions = { ...(defaultCleaningOptions ?? {}) }
  const validOptionKeys = new Set(Object.keys(fallbackOptions))
  let parsed

  try {
    parsed = JSON.parse(rawValue)
  } catch {
    throw new Error('Invalid JSON file.')
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Backup file shape is invalid.')
  }

  const sourceOptions = parsed.cleaningOptions ?? {}
  const nextCleaningOptions = { ...fallbackOptions }

  if (sourceOptions && typeof sourceOptions === 'object') {
    for (const [key, value] of Object.entries(sourceOptions)) {
      if (!validOptionKeys.has(key)) {
        continue
      }

      nextCleaningOptions[key] = Boolean(value)
    }
  }

  return {
    cleaningOptions: nextCleaningOptions,
    customRules: sanitizeCustomRules(parsed.customRules),
  }
}
