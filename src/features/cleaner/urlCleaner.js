const URL_PATTERN = /\bhttps?:\/\/[^\s<>"']+/gi
const TRACKING_PARAM_NAMES = new Set([
  'fbclid',
  'gclid',
  'dclid',
  'msclkid',
  'mc_cid',
  'mc_eid',
  'igshid',
  '_hsenc',
  '_hsmi',
  'mkt_tok',
  'vero_id',
])
const REDIRECT_PARAM_CANDIDATES = ['url', 'u', 'q', 'target', 'dest', 'destination', 'redirect', 'redirect_url', 'redirect_uri', 'r']
const WRAPPER_HOST_MARKERS = ['google.', 'facebook.com', 'l.instagram.com', 'lnkd.in', 't.co', 'outlook.com', 'safelinks.protection.outlook.com']
const URL_START_PATTERN = /^https?:\/\//i
const URL_CONTINUATION_CHARACTER = /[^\s<>"']/
const WRAPPED_URL_CONTINUATION_HINT = /^[/?#&%=]/
const WRAPPED_URL_PREVIOUS_HINT = /[/?#&%=._~-]$/
const WRAPPED_URL_PARTIAL_ESCAPE_HINT = /%(?:[0-9a-f])?$/i

function safeDecode(value) {
  let decoded = value

  for (let index = 0; index < 3; index += 1) {
    try {
      const nextValue = decodeURIComponent(decoded)

      if (nextValue === decoded) {
        break
      }

      decoded = nextValue
    } catch {
      break
    }
  }

  return decoded
}

function isTrackingParam(name) {
  const lowerName = name.toLowerCase()
  return lowerName.startsWith('utm_') || TRACKING_PARAM_NAMES.has(lowerName)
}

function shouldTryUnwrap(url) {
  const host = url.hostname.toLowerCase()
  const path = url.pathname.toLowerCase()

  return (
    WRAPPER_HOST_MARKERS.some((marker) => host.includes(marker)) ||
    path.includes('/url') ||
    path.includes('/redirect') ||
    path.includes('/out') ||
    path.includes('/link')
  )
}

function findRedirectTarget(url) {
  if (!shouldTryUnwrap(url)) {
    return null
  }

  for (const name of REDIRECT_PARAM_CANDIDATES) {
    const value = url.searchParams.get(name)

    if (!value) {
      continue
    }

    const decodedValue = safeDecode(value)

    if (/^https?:\/\//i.test(decodedValue)) {
      return { target: decodedValue, paramName: name }
    }
  }

  return null
}

function unwrapRedirect(url, enabled = true) {
  if (!enabled) {
    return { url, redirectSources: [] }
  }

  let currentUrl = url
  const redirectSources = []

  for (let depth = 0; depth < 3; depth += 1) {
    const found = findRedirectTarget(currentUrl)

    if (!found) {
      break
    }

    try {
      redirectSources.push(`${currentUrl.hostname}${currentUrl.pathname} -> ${found.paramName}`)
      currentUrl = new URL(found.target)
    } catch {
      break
    }
  }

  return { url: currentUrl, redirectSources }
}

function formatDecodedPath(pathname) {
  const trailingSlash = pathname.endsWith('/') && pathname.length > 1
  const segments = pathname
    .split('/')
    .map((segment, index) => (index === 0 ? '' : safeDecode(segment)))
  let decodedPath = segments.join('/')

  if (!decodedPath) {
    decodedPath = '/'
  }

  if (trailingSlash && !decodedPath.endsWith('/')) {
    decodedPath += '/'
  }

  return decodedPath
}

function formatDecodedQuery(searchParams) {
  const pairs = []

  for (const [key, value] of searchParams.entries()) {
    if (value) {
      pairs.push(`${key}=${value}`)
    } else {
      pairs.push(key)
    }
  }

  return pairs.length > 0 ? `?${pairs.join('&')}` : ''
}

function formatDecodedHash(hash) {
  if (!hash || hash === '#') {
    return ''
  }

  return `#${safeDecode(hash.slice(1))}`
}

function formatReadableUrl(url) {
  const base = `${url.protocol}//${url.host}`
  return `${base}${formatDecodedPath(url.pathname)}${formatDecodedQuery(url.searchParams)}${formatDecodedHash(url.hash)}`
}

function splitTrailingPunctuation(value) {
  let core = value
  let trailing = ''

  while (core) {
    const character = core.at(-1)

    if (/[.,!?;:]/.test(character)) {
      trailing = character + trailing
      core = core.slice(0, -1)
      continue
    }

    if (/[)\]}]/.test(character)) {
      const opener = character === ')' ? '(' : character === ']' ? '[' : '{'
      const openerCount = (core.match(new RegExp(`\\${opener}`, 'g')) ?? []).length
      const closerCount = (core.match(new RegExp(`\\${character}`, 'g')) ?? []).length

      if (closerCount > openerCount) {
        trailing = character + trailing
        core = core.slice(0, -1)
        continue
      }
    }

    break
  }

  return { core, trailing }
}

function startsUrlAt(value, index) {
  return value.startsWith('https://', index) || value.startsWith('http://', index)
}

function readUrlContinuation(value, index) {
  let cursor = index

  while (cursor < value.length && URL_CONTINUATION_CHARACTER.test(value[cursor])) {
    cursor += 1
  }

  return value.slice(index, cursor)
}

function shouldRepairWrappedUrl(currentUrl, continuation) {
  if (!continuation) {
    return false
  }

  if (!URL_START_PATTERN.test(currentUrl)) {
    return false
  }

  return (
    WRAPPED_URL_CONTINUATION_HINT.test(continuation) ||
    WRAPPED_URL_PREVIOUS_HINT.test(currentUrl) ||
    WRAPPED_URL_PARTIAL_ESCAPE_HINT.test(currentUrl)
  )
}

function repairWrappedUrlsInText(value, enabled = false) {
  if (!enabled) {
    return {
      text: value,
      wrappedUrlsRepaired: 0,
    }
  }

  let text = ''
  let index = 0
  let wrappedUrlsRepaired = 0

  while (index < value.length) {
    if (!startsUrlAt(value, index)) {
      text += value[index]
      index += 1
      continue
    }

    let url = ''
    let cursor = index
    let repairedCurrentUrl = false

    while (cursor < value.length) {
      const character = value[cursor]

      if (/\s/.test(character)) {
        let whitespaceEnd = cursor

        while (whitespaceEnd < value.length && /\s/.test(value[whitespaceEnd])) {
          whitespaceEnd += 1
        }

        const whitespace = value.slice(cursor, whitespaceEnd)

        if (!whitespace.includes('\n')) {
          break
        }

        const continuation = readUrlContinuation(value, whitespaceEnd)

        if (!shouldRepairWrappedUrl(url, continuation)) {
          break
        }

        repairedCurrentUrl = true
        cursor = whitespaceEnd
        continue
      }

      if (!URL_CONTINUATION_CHARACTER.test(character)) {
        break
      }

      url += character
      cursor += 1
    }

    if (repairedCurrentUrl) {
      wrappedUrlsRepaired += 1
    }

    text += url
    index = cursor
  }

  return {
    text,
    wrappedUrlsRepaired,
  }
}

function cleanSingleUrl(rawUrl, options = {}) {
  const { core, trailing } = splitTrailingPunctuation(rawUrl)

  let parsedUrl

  try {
    parsedUrl = new URL(core)
  } catch {
    return null
  }

  const { url: unwrappedUrl, redirectSources } = unwrapRedirect(parsedUrl, options.unwrapRedirects !== false)
  const removedParams = []
  const filteredEntries = []

  for (const [name, value] of unwrappedUrl.searchParams.entries()) {
    if (options.stripTrackingParams !== false && isTrackingParam(name)) {
      removedParams.push(`${name}=${value}`)
      continue
    }

    filteredEntries.push([name, value])
  }

  const cleanedUrl = new URL(unwrappedUrl.toString())
  cleanedUrl.search = ''

  for (const [name, value] of filteredEntries) {
    cleanedUrl.searchParams.append(name, value)
  }

  const readableUrl =
    options.decodeReadableUrls === false ? cleanedUrl.toString() : formatReadableUrl(cleanedUrl)
  const finalUrl = `${readableUrl}${trailing}`
  const changed = finalUrl !== rawUrl

  if (!changed) {
    return null
  }

  const decoded =
    options.decodeReadableUrls !== false &&
    readableUrl !== `${cleanedUrl.protocol}//${cleanedUrl.host}${cleanedUrl.pathname}${cleanedUrl.search}${cleanedUrl.hash}`

  return {
    originalUrl: rawUrl,
    cleanedUrl: finalUrl,
    removedItems: [
      ...redirectSources.map((source) => `Unwrapped redirect from ${source}`),
      ...removedParams.map((param) => `Removed ${param}`),
      ...(decoded ? ['Decoded percent-encoding for readability'] : []),
    ],
    decoded,
    unwrapped: redirectSources.length,
    removedParamsCount: removedParams.length,
  }
}

export function cleanUrlsInText(value, options = {}) {
  const urlChanges = []
  const wrappedUrlRepairResult = repairWrappedUrlsInText(value, options.repairWrappedUrls === true)

  const text = wrappedUrlRepairResult.text.replace(URL_PATTERN, (match) => {
    const cleaned = cleanSingleUrl(match, options)

    if (!cleaned) {
      return match
    }

    urlChanges.push(cleaned)
    return cleaned.cleanedUrl
  })

  return {
    text,
    urlChanges,
    summary: {
      urlsChanged: urlChanges.length,
      wrappedUrlsRepaired: wrappedUrlRepairResult.wrappedUrlsRepaired,
      trackingParamsRemoved: urlChanges.reduce((sum, change) => sum + change.removedParamsCount, 0),
      redirectsUnwrapped: urlChanges.reduce((sum, change) => sum + change.unwrapped, 0),
      urlsDecoded: urlChanges.filter((change) => change.decoded).length,
    },
  }
}
