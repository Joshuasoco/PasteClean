import { describe, expect, it } from 'vitest'
import { cleanUrlsInText } from './urlCleaner'

describe('cleanUrlsInText', () => {
  it('removes tracking params and decodes urls for readability', () => {
    const input = 'Visit https://example.com/New%20Drop?utm_source=newsletter&color=blue'
    const result = cleanUrlsInText(input)

    expect(result.text).toContain('https://example.com/New Drop?color=blue')
    expect(result.summary.urlsChanged).toBe(1)
    expect(result.summary.trackingParamsRemoved).toBe(1)
    expect(result.summary.urlsDecoded).toBe(1)
  })

  it('unwraps redirect wrappers and cleans destination params', () => {
    const input =
      'Open https://www.google.com/url?q=https%3A%2F%2Fexample.com%2Fdocs%3Futm_source%3Demail%26keep%3D1&sa=D'
    const result = cleanUrlsInText(input)

    expect(result.text).toContain('https://example.com/docs?keep=1')
    expect(result.summary.redirectsUnwrapped).toBe(1)
    expect(result.summary.trackingParamsRemoved).toBe(1)
  })

  it('supports disabling url cleanup options', () => {
    const input = 'Link https://example.com/a%20b?utm_source=news&ok=1'
    const result = cleanUrlsInText(input, {
      stripTrackingParams: false,
      decodeReadableUrls: false,
      unwrapRedirects: false,
    })

    expect(result.text).toBe(input)
    expect(result.summary.urlsChanged).toBe(0)
  })
})
