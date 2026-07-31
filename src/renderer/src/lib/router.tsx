import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from 'react'

export interface Route {

  path: string
  segments: string[]
  query: URLSearchParams
  hash: string
}

function parse(): Route {
  const raw = window.location.hash.replace(/^#/, '') || '/'
  const [pathname, search = ''] = raw.split('?')
  const path = pathname || '/'
  return {
    path,
    segments: path.split('/').filter(Boolean),
    query: new URLSearchParams(search),
    hash: raw
  }
}

const RouterContext = createContext<Route>(parse())

export function RouterProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [route, setRoute] = useState<Route>(parse)

  useEffect(() => {
    const onChange = (): void => setRoute(parse())
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])

  return <RouterContext.Provider value={route}>{children}</RouterContext.Provider>
}

export function useRoute(): Route {
  return useContext(RouterContext)
}

export function navigate(path: string, options: { replace?: boolean } = {}): void {
  const target = path.startsWith('#') ? path : `#${path}`
  if (window.location.hash === target) return
  if (options.replace) {
    window.history.replaceState(null, '', target)
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  } else {
    window.location.hash = target
  }
}

export function back(): void {
  window.history.back()
}


export function setQueryParam(key: string, value: string | null): void {
  const route = parse()
  const query = new URLSearchParams(route.query)
  if (value === null || value === '') query.delete(key)
  else query.set(key, value)
  const search = query.toString()
  navigate(`${route.path}${search ? `?${search}` : ''}`, { replace: true })
}

/** Batched sibling of setQueryParam — one navigation for several params. */
export function setQueryParams(updates: Record<string, string | null>): void {
  const route = parse()
  const query = new URLSearchParams(route.query)
  for (const [key, value] of Object.entries(updates)) {
    if (value === null || value === '') query.delete(key)
    else query.set(key, value)
  }
  const search = query.toString()
  navigate(`${route.path}${search ? `?${search}` : ''}`, { replace: true })
}

export function useQueryParam(key: string, fallback = ''): string {
  const route = useRoute()
  return route.query.get(key) ?? fallback
}

/**
 * Comma-separated list stored in the URL. Keeping filter state in the address
 * means it survives navigating to a project page and back, which local
 * component state does not.
 */
export function useQueryList(key: string): [string[], (next: string[]) => void] {
  const route = useRoute()
  const raw = route.query.get(key) ?? ''
  const value = useMemo(() => (raw ? raw.split(',').filter(Boolean) : []), [raw])
  const set = useCallback(
    (next: string[]) => setQueryParams({ [key]: next.length ? next.join(',') : null }),
    [key]
  )
  return [value, set]
}


export function matchRoute(pattern: string, path: string): Record<string, string> | null {
  const patternParts = pattern.split('/').filter(Boolean)
  const pathParts = path.split('/').filter(Boolean)

  const params: Record<string, string> = {}
  const wildcard = patternParts[patternParts.length - 1] === '*'
  if (!wildcard && patternParts.length !== pathParts.length) return null
  if (wildcard && pathParts.length < patternParts.length - 1) return null

  for (let i = 0; i < patternParts.length; i++) {
    const segment = patternParts[i]
    if (segment === '*') return params
    if (segment.startsWith(':')) {
      params[segment.slice(1)] = decodeURIComponent(pathParts[i])
    } else if (segment !== pathParts[i]) {
      return null
    }
  }

  return params
}

export function useParams(pattern: string): Record<string, string> {
  const route = useRoute()
  return useMemo(() => matchRoute(pattern, route.path) ?? {}, [pattern, route.path])
}

export function Link({
  to,
  className,
  children,
  onClick,
  ...rest
}: {
  to: string
  className?: string
  children: ReactNode
  onClick?: () => void
} & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'href' | 'onClick'>): React.JSX.Element {
  return (
    <a
      href={`#${to}`}
      className={className}
      onClick={(event) => {
        event.preventDefault()
        onClick?.()
        navigate(to)
      }}
      {...rest}
    >
      {children}
    </a>
  )
}
