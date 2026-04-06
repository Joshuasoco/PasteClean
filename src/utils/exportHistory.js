function escapeCsvValue(value) {
  const stringValue = String(value ?? '')
  return `"${stringValue.replaceAll('"', '""')}"`
}

function downloadFile(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType })
  const objectUrl = URL.createObjectURL(blob)
  const link = document.createElement('a')

  link.href = objectUrl
  link.download = filename
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0)
}

function buildTxt(history) {
  return history
    .map((entry, index) => {
      return [
        `Entry ${index + 1}`,
        `Saved: ${entry.savedAt}`,
        `Mode: ${entry.modeLabel}`,
        `Source preset: ${entry.sourcePresetLabel ?? 'No preset'}`,
        `Protected regions: ${entry.protectedRegionCount ?? 0}`,
        `URLs changed: ${entry.urlChanges}`,
        `Custom replacements: ${entry.customReplacements}`,
        'Input:',
        entry.input,
        'Output:',
        entry.cleanedText,
      ].join('\n')
    })
    .join('\n\n====================\n\n')
}

function buildCsv(history) {
  const header = ['saved_at', 'mode', 'source_preset', 'protected_regions', 'url_changes', 'custom_replacements', 'input', 'cleaned_text']
  const rows = history.map((entry) =>
    [
      escapeCsvValue(entry.savedAt),
      escapeCsvValue(entry.modeLabel),
      escapeCsvValue(entry.sourcePresetLabel ?? 'No preset'),
      escapeCsvValue(entry.protectedRegionCount ?? 0),
      escapeCsvValue(entry.urlChanges),
      escapeCsvValue(entry.customReplacements),
      escapeCsvValue(entry.input),
      escapeCsvValue(entry.cleanedText),
    ].join(',')
  )

  return [header.join(','), ...rows].join('\n')
}

export function exportHistory(history, format) {
  if (!history.length) {
    return false
  }

  const timestamp = new Date().toISOString().slice(0, 19).replaceAll(':', '-')

  if (format === 'csv') {
    downloadFile(`pasteclean-history-${timestamp}.csv`, buildCsv(history), 'text/csv;charset=utf-8')
    return true
  }

  downloadFile(`pasteclean-history-${timestamp}.txt`, buildTxt(history), 'text/plain;charset=utf-8')
  return true
}
