import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Logo } from './Logo'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
  stack: string | null
}

/**
 * A render error must never leave the user staring at a black window. This
 * catches it, shows what happened and offers a way back.
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null, stack: null }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Orbit UI crashed', error, info)
    this.setState({ stack: info.componentStack ?? null })
  }

  private reset = (): void => {
    this.setState({ error: null, stack: null })
    window.location.hash = '/'
  }

  override render(): ReactNode {
    const { error, stack } = this.state
    if (!error) return this.props.children

    return (
      <div className="boot" style={{ alignItems: 'flex-start', paddingTop: '12vh', overflowY: 'auto' }}>
        <div className="boot__inner" style={{ maxWidth: 620, alignItems: 'stretch', gap: 'var(--s-5)' }}>
          <div className="row gap-4">
            <Logo size={52} />
            <div>
              <h1 className="t-h1">Something went wrong</h1>
              <p className="t-small dim" style={{ marginTop: 4 }}>
                The interface hit an error. Your instances and files are untouched.
              </p>
            </div>
          </div>

          <pre
            className="t-mono selectable"
            style={{
              background: 'var(--surface-inset)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--r-md)',
              padding: 'var(--s-4)',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              maxHeight: 280,
              overflowY: 'auto',
              color: 'var(--text-secondary)',
              lineHeight: 1.6
            }}
          >
            {error.message}
            {stack ? `\n${stack}` : ''}
          </pre>

          <div className="row gap-2">
            <button className="btn btn--primary" onClick={this.reset} type="button">
              Back to Home
            </button>
            <button className="btn btn--secondary" onClick={() => window.orbit.app.relaunch()} type="button">
              Restart Orbit
            </button>
            <button
              className="btn btn--ghost"
              onClick={() => {
                void navigator.clipboard.writeText(`${error.message}\n${error.stack ?? ''}\n${stack ?? ''}`)
              }}
              type="button"
            >
              Copy details
            </button>
          </div>
        </div>
      </div>
    )
  }
}
