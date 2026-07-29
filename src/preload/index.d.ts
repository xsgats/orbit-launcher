import type { OrbitApi } from '../shared/api'

declare global {
  interface Window {
    orbit: OrbitApi
  }
}

export {}
