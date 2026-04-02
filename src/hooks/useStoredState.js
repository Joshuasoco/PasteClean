import { useEffect, useState } from 'react'

function resolveInitialValue(initialValue) {
  return typeof initialValue === 'function' ? initialValue() : initialValue
}

export function useStoredState(key, initialValue) {
  const [state, setState] = useState(() => {
    const fallbackValue = resolveInitialValue(initialValue)

    if (typeof window === 'undefined') {
      return fallbackValue
    }

    try {
      const storedValue = window.localStorage.getItem(key)

      if (!storedValue) {
        return fallbackValue
      }

      return JSON.parse(storedValue)
    } catch {
      return fallbackValue
    }
  })

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    try {
      window.localStorage.setItem(key, JSON.stringify(state))
    } catch {
      return
    }
  }, [key, state])

  return [state, setState]
}
