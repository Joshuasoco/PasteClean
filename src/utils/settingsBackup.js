const SETTINGS_BACKUP_VERSION = 2

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

function sanitizeSourceMemory(sourceMemory) {
  if (!sourceMemory || typeof sourceMemory !== 'object') {
    return {}
  }

  return Object.fromEntries(
    Object.entries(sourceMemory).flatMap(([sourcePresetId, entry]) => {
      if (typeof sourcePresetId !== 'string' || !sourcePresetId || !entry || typeof entry !== 'object') {
        return []
      }

      const preferredMode =
        typeof entry.preferredMode === 'string' && entry.preferredMode ? entry.preferredMode : undefined
      const preferredDestination =
        typeof entry.preferredDestination === 'string' && entry.preferredDestination
          ? entry.preferredDestination
          : undefined

      if (!preferredMode && !preferredDestination) {
        return []
      }

      return [
        [
          sourcePresetId,
          {
            preferredMode,
            preferredDestination,
          },
        ],
      ]
    })
  )
}

export function serializeSettingsBackup({
  cleaningOptions,
  sourcePreset = 'none',
  destinationPreset = 'none',
  customRules,
  sourceMemory,
  createdAt = new Date(),
}) {
  const exportedAt = createdAt.toISOString()
  const payload = {
    app: 'PasteClean',
    type: 'settings-backup',
    version: SETTINGS_BACKUP_VERSION,
    exportedAt,
    cleaningOptions: { ...(cleaningOptions ?? {}) },
    sourcePreset: typeof sourcePreset === 'string' && sourcePreset ? sourcePreset : 'none',
    destinationPreset: typeof destinationPreset === 'string' && destinationPreset ? destinationPreset : 'none',
    customRules: sanitizeCustomRules(customRules),
    sourceMemory: sanitizeSourceMemory(sourceMemory),
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
    sourcePreset: typeof parsed.sourcePreset === 'string' && parsed.sourcePreset ? parsed.sourcePreset : 'none',
    destinationPreset:
      typeof parsed.destinationPreset === 'string' && parsed.destinationPreset ? parsed.destinationPreset : 'none',
    customRules: sanitizeCustomRules(parsed.customRules),
    sourceMemory: sanitizeSourceMemory(parsed.sourceMemory),
  }
}
