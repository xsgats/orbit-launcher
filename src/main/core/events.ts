import { BrowserWindow } from 'electron'
import type { OrbitEventName, OrbitEvents } from '../../shared/api'


export function emit<K extends OrbitEventName>(event: K, payload: OrbitEvents[K]): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
      win.webContents.send(event, payload)
    }
  }
}





export function createThrottledEmitter<K extends OrbitEventName>(
  event: K,
  intervalMs: number,
  reducer: (pending: OrbitEvents[K][]) => OrbitEvents[K]
): { push: (payload: OrbitEvents[K]) => void; flush: () => void } {
  let pending: OrbitEvents[K][] = []
  let timer: NodeJS.Timeout | null = null

  const flush = (): void => {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    if (!pending.length) return
    const batch = pending
    pending = []
    emit(event, reducer(batch))
  }

  return {
    push(payload) {
      pending.push(payload)
      if (!timer) timer = setTimeout(flush, intervalMs)
    },
    flush
  }
}
