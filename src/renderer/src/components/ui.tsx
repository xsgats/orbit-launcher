import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode
} from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, ChevronDown, Search, X } from 'lucide-react'





type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
type ButtonSize = 'sm' | 'md' | 'lg'

export interface ButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'type'> {
  variant?: ButtonVariant
  size?: ButtonSize
  icon?: ReactNode
  iconRight?: ReactNode
  loading?: boolean
  block?: boolean
  type?: 'button' | 'submit'
}

export function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  iconRight,
  loading = false,
  block = false,
  className = '',
  children,
  type = 'button',
  ...rest
}: ButtonProps): React.JSX.Element {
  const classes = [
    'btn',
    `btn--${variant}`,
    size !== 'md' && `btn--${size}`,
    block && 'btn--block',
    !children && 'btn--icon',
    className
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <button className={classes} data-loading={loading || undefined} type={type} {...rest}>
      {icon}
      {children}
      {iconRight}
    </button>
  )
}

export function IconButton({
  label,
  active,
  danger,
  large,
  className = '',
  children,
  ...rest
}: {
  label: string
  active?: boolean
  danger?: boolean
  large?: boolean
} & React.ButtonHTMLAttributes<HTMLButtonElement>): React.JSX.Element {
  return (
    <Tooltip content={label}>
      <button
        className={`iconbtn ${large ? 'iconbtn--lg' : ''} ${danger ? 'iconbtn--danger' : ''} ${className}`}
        data-active={active || undefined}
        aria-label={label}
        type="button"
        {...rest}
      >
        {children}
      </button>
    </Tooltip>
  )
}





export function TextField({
  label,
  hint,
  error,
  prefix,
  suffix,
  mono,
  className = '',
  ...rest
}: {
  label?: string
  hint?: string
  error?: string | null
  prefix?: ReactNode
  suffix?: ReactNode
  mono?: boolean
} & React.InputHTMLAttributes<HTMLInputElement>): React.JSX.Element {
  const id = useId()
  return (
    <div className={`field ${className}`}>
      {label && (
        <label className="field__label" htmlFor={id}>
          {label}
        </label>
      )}
      <div className={`input ${mono ? 'input--mono' : ''} ${error ? 'input--invalid' : ''}`}>
        {prefix && <span className="input__affix">{prefix}</span>}
        <input id={id} spellCheck={false} {...rest} />
        {suffix && <span className="input__affix">{suffix}</span>}
      </div>
      {error ? <span className="field__error">{error}</span> : hint ? <span className="field__hint">{hint}</span> : null}
    </div>
  )
}

export function TextArea({
  label,
  hint,
  rows = 4,
  className = '',
  ...rest
}: {
  label?: string
  hint?: string
} & React.TextareaHTMLAttributes<HTMLTextAreaElement>): React.JSX.Element {
  const id = useId()
  return (
    <div className={`field ${className}`}>
      {label && (
        <label className="field__label" htmlFor={id}>
          {label}
        </label>
      )}
      <div className="input input--textarea">
        <textarea id={id} rows={rows} spellCheck={false} {...rest} />
      </div>
      {hint && <span className="field__hint">{hint}</span>}
    </div>
  )
}

export function SearchInput({
  value,
  onChange,
  placeholder = 'Search…',
  autoFocus,
  className = ''
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  autoFocus?: boolean
  className?: string
}): React.JSX.Element {
  return (
    <div className={`input ${className}`} style={{ minWidth: 0 }}>
      <span className="input__affix">
        <Search size={15} />
      </span>
      <input
        value={value}
        placeholder={placeholder}
        autoFocus={autoFocus}
        onChange={(event) => onChange(event.target.value)}
        spellCheck={false}
      />
      {value && (
        <button className="input__affix" onClick={() => onChange('')} aria-label="Clear search" type="button">
          <X size={14} />
        </button>
      )}
    </div>
  )
}





export interface SelectOption {
  value: string
  label: string
  disabled?: boolean
}

export function Select({
  label,
  hint,
  options,
  value,
  onChange,
  small,
  className = '',
  groups,
  ...rest
}: {
  label?: string
  hint?: string
  options?: SelectOption[]
  groups?: { label: string; options: SelectOption[] }[]
  value: string
  onChange: (value: string) => void
  small?: boolean
  className?: string
} & Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'value' | 'onChange'>): React.JSX.Element {
  const id = useId()
  return (
    <div className={`field ${className}`}>
      {label && (
        <label className="field__label" htmlFor={id}>
          {label}
        </label>
      )}
      <div className={`select ${small ? 'select--sm' : ''}`}>
        <select id={id} value={value} onChange={(event) => onChange(event.target.value)} {...rest}>
          {options?.map((option) => (
            <option key={option.value} value={option.value} disabled={option.disabled}>
              {option.label}
            </option>
          ))}
          {groups?.map((group) => (
            <optgroup key={group.label} label={group.label}>
              {group.options.map((option) => (
                <option key={option.value} value={option.value} disabled={option.disabled}>
                  {option.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <span className="select__chevron">
          <ChevronDown size={14} />
        </span>
      </div>
      {hint && <span className="field__hint">{hint}</span>}
    </div>
  )
}





export function Switch({
  checked,
  onChange,
  disabled,
  label
}: {
  checked: boolean
  onChange: (value: boolean) => void
  disabled?: boolean
  label?: string
}): React.JSX.Element {
  return (
    <button
      className="switch"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      data-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      type="button"
    />
  )
}

export function Checkbox({
  checked,
  onChange,
  label,
  disabled
}: {
  checked: boolean
  onChange: (value: boolean) => void
  label?: ReactNode
  disabled?: boolean
}): React.JSX.Element {
  const control = (
    <button
      className="checkbox"
      role="checkbox"
      aria-checked={checked}
      data-checked={checked}
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation()
        onChange(!checked)
      }}
      type="button"
    >
      <Check size={12} strokeWidth={3.2} />
    </button>
  )

  if (!label) return control

  return (
    <label className="checkbox-row">
      {control}
      <span>{label}</span>
    </label>
  )
}

export function Slider({
  value,
  min,
  max,
  step = 1,
  onChange,
  format
}: {
  value: number
  min: number
  max: number
  step?: number
  onChange: (value: number) => void
  format?: (value: number) => string
}): React.JSX.Element {
  const percent = max > min ? ((value - min) / (max - min)) * 100 : 0
  return (
    <div className="col gap-2" style={{ minWidth: 200 }}>
      <input
        className="slider"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        style={{ ['--pct' as string]: `${percent}%` }}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      {format && (
        <div className="row between t-small dimmer nums">
          <span>{format(min)}</span>
          <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{format(value)}</span>
          <span>{format(max)}</span>
        </div>
      )}
    </div>
  )
}





export function Segmented<T extends string>({
  value,
  onChange,
  options
}: {
  value: T
  onChange: (value: T) => void
  options: { value: T; label: string; icon?: ReactNode }[]
}): React.JSX.Element {
  const groupId = useId()
  return (
    <div className="segmented" role="tablist">
      {options.map((option) => (
        <button
          key={option.value}
          className="segmented__item"
          data-active={value === option.value}
          role="tab"
          aria-selected={value === option.value}
          onClick={() => onChange(option.value)}
          type="button"
        >
          {value === option.value && (
            <motion.span
              className="segmented__thumb"
              layoutId={`segmented-${groupId}`}
              transition={{ type: 'spring', stiffness: 460, damping: 38 }}
              style={{ left: 0, right: 0 }}
            />
          )}
          <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {option.icon}
            {option.label}
          </span>
        </button>
      ))}
    </div>
  )
}





export function Tabs<T extends string>({
  value,
  onChange,
  tabs
}: {
  value: T
  onChange: (value: T) => void
  tabs: { value: T; label: string; icon?: ReactNode; count?: number }[]
}): React.JSX.Element {
  const groupId = useId()
  return (
    <div className="tabs" role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.value}
          className="tab"
          data-active={value === tab.value}
          role="tab"
          aria-selected={value === tab.value}
          onClick={() => onChange(tab.value)}
          type="button"
        >
          {tab.icon}
          {tab.label}
          {tab.count !== undefined && tab.count > 0 && <span className="tab__count">{tab.count}</span>}
          {value === tab.value && (
            <motion.span
              className="tab__underline"
              layoutId={`tabs-${groupId}`}
              transition={{ type: 'spring', stiffness: 480, damping: 40 }}
              style={{ left: 0, right: 0 }}
            />
          )}
        </button>
      ))}
    </div>
  )
}





export function Chip({
  children,
  tone,
  selected,
  onClick,
  loader,
  className = '',
  title
}: {
  children: ReactNode
  tone?: 'accent' | 'success' | 'warning' | 'danger'
  selected?: boolean
  onClick?: () => void
  loader?: string
  className?: string
  title?: string
}): React.JSX.Element {
  const classes = [
    'chip',
    tone && `chip--${tone}`,
    onClick && 'chip--interactive',
    loader && 'chip--loader',
    className
  ]
    .filter(Boolean)
    .join(' ')

  if (onClick) {
    return (
      <button className={classes} data-selected={selected} data-loader={loader} onClick={onClick} title={title} type="button">
        {children}
      </button>
    )
  }

  return (
    <span className={classes} data-loader={loader} title={title}>
      {children}
    </span>
  )
}





export function Progress({ value, className = '' }: { value: number; className?: string }): React.JSX.Element {
  const indeterminate = value < 0
  return (
    <div className={`progress ${className}`} data-indeterminate={indeterminate}>
      <div className="progress__bar" style={{ width: indeterminate ? undefined : `${Math.min(100, value * 100)}%` }} />
    </div>
  )
}

export function ProgressRing({
  value,
  size = 34,
  stroke = 3
}: {
  value: number
  size?: number
  stroke?: number
}): React.JSX.Element {
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const clamped = value < 0 ? 0.28 : Math.max(0, Math.min(1, value))
  return (
    <svg
      className="progress-ring"
      width={size}
      height={size}
      style={value < 0 ? { animation: 'spin 1.1s linear infinite' } : undefined}
    >
      <circle
        className="progress-ring__track"
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        strokeWidth={stroke}
      />
      <circle
        className="progress-ring__fill"
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        strokeWidth={stroke}
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - clamped)}
      />
    </svg>
  )
}





export function Tooltip({
  content,
  children,
  side = 'bottom',
  delay = 380
}: {
  content: ReactNode
  children: React.JSX.Element
  side?: 'top' | 'bottom' | 'left' | 'right'
  delay?: number
}): React.JSX.Element {
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null)
  const anchor = useRef<HTMLElement | null>(null)
  const timer = useRef<number | null>(null)

  const show = useCallback(
    (element: HTMLElement) => {
      anchor.current = element
      timer.current = window.setTimeout(() => {
        const rect = element.getBoundingClientRect()
        const offsets = {
          top: { x: rect.left + rect.width / 2, y: rect.top - 8 },
          bottom: { x: rect.left + rect.width / 2, y: rect.bottom + 8 },
          left: { x: rect.left - 8, y: rect.top + rect.height / 2 },
          right: { x: rect.right + 8, y: rect.top + rect.height / 2 }
        }
        setPosition(offsets[side])
      }, delay)
    },
    [delay, side]
  )

  const hide = useCallback(() => {
    if (timer.current) window.clearTimeout(timer.current)
    setPosition(null)
  }, [])

  useEffect(() => () => hide(), [hide])

  if (!content) return children

  const transform =
    side === 'top'
      ? 'translate(-50%, -100%)'
      : side === 'bottom'
        ? 'translate(-50%, 0)'
        : side === 'left'
          ? 'translate(-100%, -50%)'
          : 'translate(0, -50%)'

  return (
    <>
      <span
        style={{ display: 'contents' }}
        onMouseEnter={(event) => show(event.currentTarget.firstElementChild as HTMLElement)}
        onMouseLeave={hide}
        onMouseDown={hide}
      >
        {children}
      </span>
      {position &&
        createPortal(
          <motion.div
            className="tooltip"
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.12 }}
            style={{ left: position.x, top: position.y, transform }}
          >
            {content}
          </motion.div>,
          document.body
        )}
    </>
  )
}





export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  width = 'md',
  icon
}: {
  open: boolean
  onClose: () => void
  title: ReactNode
  description?: ReactNode
  children?: ReactNode
  footer?: ReactNode
  width?: 'narrow' | 'md' | 'wide'
  icon?: ReactNode
}): React.JSX.Element {
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) onClose()
          }}
        >
          <motion.div
            className={`dialog ${width === 'wide' ? 'dialog--wide' : width === 'narrow' ? 'dialog--narrow' : ''}`}
            role="dialog"
            aria-modal="true"
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 8 }}
            transition={{ type: 'spring', stiffness: 420, damping: 34 }}
          >
            <div className="dialog__header">
              {icon && (
                <div
                  style={{
                    display: 'grid',
                    placeItems: 'center',
                    width: 40,
                    height: 40,
                    borderRadius: 'var(--r-md)',
                    background: 'var(--surface-2)',
                    color: 'var(--accent)',
                    flexShrink: 0
                  }}
                >
                  {icon}
                </div>
              )}
              <div className="grow">
                <h2 className="dialog__title">{title}</h2>
                {description && <p className="dialog__desc">{description}</p>}
              </div>
              <button className="iconbtn" onClick={onClose} aria-label="Close" type="button">
                <X size={16} />
              </button>
            </div>
            {children && <div className="dialog__body">{children}</div>}
            {footer && <div className="dialog__footer">{footer}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  )
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Confirm',
  danger,
  icon
}: {
  open: boolean
  onClose: () => void
  onConfirm: () => void | Promise<void>
  title: string
  description: ReactNode
  confirmLabel?: string
  danger?: boolean
  icon?: ReactNode
}): React.JSX.Element {
  const [busy, setBusy] = useState(false)

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      width="narrow"
      icon={icon}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant={danger ? 'danger' : 'primary'}
            loading={busy}
            onClick={async () => {
              setBusy(true)
              try {
                await onConfirm()
                onClose()
              } finally {
                setBusy(false)
              }
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    />
  )
}





export interface MenuItemSpec {
  label: string
  icon?: ReactNode
  onSelect?: () => void
  danger?: boolean
  disabled?: boolean
  separator?: boolean
  shortcut?: string
  heading?: string
}

interface MenuState {
  items: MenuItemSpec[]
  x: number
  y: number
}

const MenuContext = createContext<(state: MenuState | null) => void>(() => undefined)

export function MenuProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [state, setState] = useState<MenuState | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const [adjusted, setAdjusted] = useState<{ x: number; y: number } | null>(null)

  useLayoutEffect(() => {
    if (!state || !ref.current) {
      setAdjusted(null)
      return
    }
    const rect = ref.current.getBoundingClientRect()
    setAdjusted({
      x: Math.min(state.x, window.innerWidth - rect.width - 8),
      y: Math.min(state.y, window.innerHeight - rect.height - 8)
    })
  }, [state])

  useEffect(() => {
    if (!state) return
    const close = (): void => setState(null)
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') close()
    }
    window.addEventListener('click', close)
    window.addEventListener('resize', close)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('resize', close)
      window.removeEventListener('keydown', onKey)
    }
  }, [state])

  return (
    <MenuContext.Provider value={setState}>
      {children}
      {state &&
        createPortal(
          <motion.div
            ref={ref}
            className="menu"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.12 }}
            style={{ left: adjusted?.x ?? state.x, top: adjusted?.y ?? state.y }}
            onClick={(event) => event.stopPropagation()}
          >
            {state.items.map((item, index) => {
              if (item.separator) return <div className="menu__sep" key={`sep-${index}`} />
              if (item.heading)
                return (
                  <div className="menu__label" key={`head-${index}`}>
                    {item.heading}
                  </div>
                )
              return (
                <button
                  key={item.label}
                  className={`menu__item ${item.danger ? 'menu__item--danger' : ''}`}
                  disabled={item.disabled}
                  onClick={() => {
                    setState(null)
                    item.onSelect?.()
                  }}
                  type="button"
                >
                  {item.icon}
                  <span className="grow truncate">{item.label}</span>
                  {item.shortcut && <span className="menu__item__shortcut">{item.shortcut}</span>}
                </button>
              )
            })}
          </motion.div>,
          document.body
        )}
    </MenuContext.Provider>
  )
}

export function useContextMenu(): (event: React.MouseEvent, items: MenuItemSpec[]) => void {
  const setState = useContext(MenuContext)
  return useCallback(
    (event, items) => {
      event.preventDefault()
      event.stopPropagation()
      setState({ items, x: event.clientX, y: event.clientY })
    },
    [setState]
  )
}


export function useAnchoredMenu(): (element: HTMLElement, items: MenuItemSpec[]) => void {
  const setState = useContext(MenuContext)
  return useCallback(
    (element, items) => {
      const rect = element.getBoundingClientRect()
      setState({ items, x: rect.left, y: rect.bottom + 6 })
    },
    [setState]
  )
}





export function EmptyState({
  icon,
  title,
  description,
  action
}: {
  icon: ReactNode
  title: string
  description?: ReactNode
  action?: ReactNode
}): React.JSX.Element {
  return (
    <motion.div className="empty" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <div className="empty__glyph">{icon}</div>
      <div className="col gap-2 center">
        <h3 className="empty__title">{title}</h3>
        {description && <p className="empty__desc">{description}</p>}
      </div>
      {action}
    </motion.div>
  )
}

export function Skeleton({
  width = '100%',
  height = 16,
  radius
}: {
  width?: number | string
  height?: number | string
  radius?: number | string
}): React.JSX.Element {
  return <div className="skeleton" style={{ width, height, borderRadius: radius }} />
}





export function Callout({
  tone = 'default',
  icon,
  children
}: {
  tone?: 'default' | 'accent' | 'warning' | 'danger'
  icon?: ReactNode
  children: ReactNode
}): React.JSX.Element {
  return (
    <div className={`callout ${tone !== 'default' ? `callout--${tone}` : ''}`}>
      {icon && <span className="callout__icon">{icon}</span>}
      <div className="grow">{children}</div>
    </div>
  )
}





export function Lightbox({ src, onClose }: { src: string | null; onClose: () => void }): React.JSX.Element {
  useEffect(() => {
    if (!src) return
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [src, onClose])

  return createPortal(
    <AnimatePresence>
      {src && (
        <motion.div
          className="lightbox"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.img
            src={src}
            initial={{ scale: 0.94 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
            alt=""
          />
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  )
}
