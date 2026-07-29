import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Blocks, ExternalLink, Newspaper, RefreshCw, WifiOff } from 'lucide-react'
import type { NewsItem } from '@shared/types'
import { Button, EmptyState, Segmented, Skeleton } from '../components/ui'
import { formatDate } from '../lib/format'
import { api, reportError } from '../state/store'

export function NewsPage(): React.JSX.Element {
  const [news, setNews] = useState<NewsItem[] | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [filter, setFilter] = useState<'all' | 'news' | 'patch'>('all')

  useEffect(() => {
    void api.news
      .list()
      .then(setNews)
      .catch(() => setNews([]))
  }, [])

  const refresh = async (): Promise<void> => {
    setRefreshing(true)
    try {
      setNews(await api.news.list(true))
    } catch (err) {
      reportError('Could not refresh the news feed', err)
    } finally {
      setRefreshing(false)
    }
  }

  const filtered = useMemo(() => {
    if (!news) return []
    if (filter === 'all') return news
    return news.filter((item) => (filter === 'patch' ? item.source === 'Patch notes' : item.source !== 'Patch notes'))
  }, [news, filter])

  return (
    <div className="page__inner page__inner--wide">
      <header className="page-header">
        <div>
          <h1 className="page-header__title">News</h1>
          <p className="page-header__sub">Announcements and patch notes from Mojang, straight in the launcher.</p>
        </div>
        <div className="row gap-3">
          <Segmented
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: 'Everything' },
              { value: 'news', label: 'Announcements' },
              { value: 'patch', label: 'Patch notes' }
            ]}
          />
          <Button
            icon={<RefreshCw size={15} className={refreshing ? 'spin' : undefined} />}
            loading={refreshing}
            onClick={() => void refresh()}
          >
            Refresh
          </Button>
        </div>
      </header>

      {news === null ? (
        <div className="news-grid">
          {Array.from({ length: 6 }, (_, index) => (
            <div className="news-card" key={index} style={{ pointerEvents: 'none' }}>
              <Skeleton height={158} radius={0} />
              <div className="news-card__body">
                <Skeleton height={10} width="28%" />
                <Skeleton height={14} width="86%" />
                <Skeleton height={11} width="100%" />
                <Skeleton height={11} width="72%" />
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={news.length === 0 ? <WifiOff size={26} /> : <Newspaper size={26} />}
          title={news.length === 0 ? 'Could not reach the news feed' : 'Nothing here'}
          description={
            news.length === 0
              ? 'Check your connection and try refreshing. Everything else in Orbit keeps working offline.'
              : 'Try a different filter.'
          }
          action={
            news.length === 0 ? (
              <Button variant="primary" onClick={() => void refresh()}>
                Try again
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="news-grid">
          {filtered.map((item, index) => (
            <motion.article
              key={item.id}
              className="news-card"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(index, 8) * 0.025, duration: 0.24 }}
              onClick={() => void api.app.openExternal(item.url)}
            >
              {item.imageUrl ? (
                <img className="news-card__img" src={item.imageUrl} alt="" loading="lazy" />
              ) : (
                <div className="news-card__img center" style={{ color: 'var(--text-tertiary)' }}>
                  <Blocks size={26} />
                </div>
              )}

              <div className="news-card__body">
                <div className="row between gap-2">
                  <span className="chip">{item.category}</span>
                  <span className="dimmer" style={{ fontSize: 11 }}>
                    {formatDate(item.date)}
                  </span>
                </div>

                <h3 className="t-h3 clamp-2" style={{ fontSize: 15 }}>
                  {item.title}
                </h3>

                <p className="t-small dim clamp-3" style={{ flex: 1 }}>
                  {item.summary}
                </p>

                <div className="row gap-1 dimmer" style={{ fontSize: 11.5, marginTop: 4 }}>
                  <ExternalLink size={11} />
                  {item.source}
                </div>
              </div>
            </motion.article>
          ))}
        </div>
      )}
    </div>
  )
}
