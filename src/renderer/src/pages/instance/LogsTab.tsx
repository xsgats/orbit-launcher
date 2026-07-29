import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDownToLine, Copy, Eraser, FileDown, ScrollText, Search } from 'lucide-react'
import type { InstanceSummary, LogLevel, LogLine } from '@shared/types'
import { Button, Checkbox, EmptyState, IconButton, SearchInput, Select } from '../../components/ui'
import { formatClock } from '../../lib/format'
import { api, reportError, toast } from '../../state/store'

const LEVELS: { value: string; label: string }[] = [
  { value: 'all', label: 'All levels' },
  { value: 'info', label: 'Info and above' },
  { value: 'warn', label: 'Warnings and errors' },
  { value: 'error', label: 'Errors only' }
]

const WEIGHT: Record<LogLevel, number> = {
  trace: 0,
  debug: 10,
  stdout: 15,
  launcher: 15,
  info: 20,
  warn: 30,
  error: 40,
  fatal: 50
}

export function LogsTab({ instance }: { instance: InstanceSummary }): React.JSX.Element {
  const [lines, setLines] = useState<LogLine[]>([])
  const [query, setQuery] = useState('')
  const [level, setLevel] = useState('all')
  const [follow, setFollow] = useState(true)
  const [wrap, setWrap] = useState(true)
  const bodyRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let alive = true
    void api.logs.get(instance.id).then((initial) => alive && setLines(initial))

    const unsubscribe = api.on('instance:log', (payload) => {
      if (payload.instanceId !== instance.id) return
      setLines((current) => (payload.lines.length === 0 ? [] : [...current, ...payload.lines].slice(-6000)))
    })

    return () => {
      alive = false
      unsubscribe()
    }
  }, [instance.id])

  useEffect(() => {
    if (!follow || !bodyRef.current) return
    bodyRef.current.scrollTop = bodyRef.current.scrollHeight
  }, [lines, follow])

  const minWeight = level === 'error' ? 40 : level === 'warn' ? 30 : level === 'info' ? 20 : 0

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return lines.filter((line) => {
      if (WEIGHT[line.level] < minWeight) return false
      if (needle && !line.message.toLowerCase().includes(needle)) return false
      return true
    })
  }, [lines, minWeight, query])

  const highlight = (message: string): React.ReactNode => {
    const needle = query.trim()
    if (!needle) return message

    const parts: React.ReactNode[] = []
    const lower = message.toLowerCase()
    const target = needle.toLowerCase()
    let index = 0
    let position = lower.indexOf(target)

    while (position !== -1) {
      if (position > index) parts.push(message.slice(index, position))
      parts.push(<mark key={`${position}-${index}`}>{message.slice(position, position + needle.length)}</mark>)
      index = position + needle.length
      position = lower.indexOf(target, index)
    }
    parts.push(message.slice(index))
    return parts
  }

  return (
    <div className="col gap-4">
      <div className="row gap-3 wrap">
        <SearchInput value={query} onChange={setQuery} placeholder="Filter log output…" className="grow" />
        <Select value={level} onChange={setLevel} options={LEVELS} small />
        <Checkbox checked={follow} onChange={setFollow} label="Follow" />
        <Checkbox checked={wrap} onChange={setWrap} label="Wrap" />

        <IconButton
          label="Copy visible lines"
          onClick={() => {
            void navigator.clipboard.writeText(filtered.map((line) => line.message).join('\n'))
            toast('Log copied to clipboard')
          }}
        >
          <Copy size={15} />
        </IconButton>

        <IconButton
          label="Save to file"
          onClick={async () => {
            try {
              const path = await api.app.pickSavePath(`${instance.name}-log.txt`, [
                { name: 'Text file', extensions: ['txt'] }
              ])
              if (!path) return
              await api.logs.export(instance.id, path)
              toast('Log saved', path)
            } catch (err) {
              reportError('Could not save the log', err)
            }
          }}
        >
          <FileDown size={15} />
        </IconButton>

        <IconButton label="Clear" onClick={() => void api.logs.clear(instance.id).then(() => setLines([]))}>
          <Eraser size={15} />
        </IconButton>
      </div>

      <div className="logview">
        <div className="logview__toolbar">
          <ScrollText size={14} style={{ color: 'var(--text-tertiary)' }} />
          <span className="t-small dim grow">
            {filtered.length.toLocaleString()} of {lines.length.toLocaleString()} lines
          </span>
          {!follow && (
            <Button
              size="sm"
              variant="ghost"
              icon={<ArrowDownToLine size={13} />}
              onClick={() => {
                setFollow(true)
                if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight
              }}
            >
              Jump to end
            </Button>
          )}
        </div>

        <div
          className="logview__body"
          ref={bodyRef}
          style={wrap ? undefined : { whiteSpace: 'nowrap' }}
          onScroll={(event) => {
            const element = event.currentTarget
            const atBottom = element.scrollHeight - element.scrollTop - element.clientHeight < 40
            if (atBottom !== follow) setFollow(atBottom)
          }}
        >
          {filtered.length === 0 ? (
            <EmptyState
              icon={lines.length ? <Search size={24} /> : <ScrollText size={24} />}
              title={lines.length ? 'No lines match' : 'Nothing logged yet'}
              description={
                lines.length
                  ? 'Change the filter or clear the search box.'
                  : 'Launch the instance and its output will stream here in real time.'
              }
            />
          ) : (
            filtered.map((line) => (
              <div className="logline" key={`${line.seq}-${line.time}`} data-level={line.level}>
                <span className="logline__time">{formatClock(line.time)}</span>
                <span className="logline__level">{line.level === 'stdout' ? 'out' : line.level}</span>
                <span className="logline__msg" style={wrap ? undefined : { whiteSpace: 'pre' }}>
                  {highlight(line.message)}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
