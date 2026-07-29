import type { NewsItem } from '../../shared/types'
import { cached, getJson } from '../core/net'
import { log } from '../core/logger'

const NEWS_URL = 'https://launchercontent.mojang.com/v2/news.json'
const PATCH_NOTES_URL = 'https://launchercontent.mojang.com/v2/javaPatchNotes.json'
const MEDIA_BASE = 'https://launchercontent.mojang.com'
const TTL = 30 * 60 * 1000

interface MojangNews {
  entries: {
    id: string
    title: string
    tag?: string
    category?: string
    date: string
    text: string
    readMoreLink?: string
    playPageImage?: { url?: string }
    newsPageImage?: { url?: string }
    newsType?: string[]
  }[]
}

interface PatchNotes {
  entries: {
    id: string
    title: string
    version: string
    type: string
    body?: string
    shortText?: string
    image?: { url?: string }
    date?: string
  }[]
}

function absolute(url: string | undefined): string | null {
  if (!url) return null
  return url.startsWith('http') ? url : `${MEDIA_BASE}${url}`
}

function stripHtml(value: string): string {
  return value
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
}

export async function listNews(refresh = false): Promise<NewsItem[]> {
  const load = async (): Promise<NewsItem[]> => {
    const [news, patches] = await Promise.all([
      getJson<MojangNews>(NEWS_URL, { timeoutMs: 20_000 }).catch(() => ({ entries: [] as MojangNews['entries'] })),
      getJson<PatchNotes>(PATCH_NOTES_URL, { timeoutMs: 20_000 }).catch(() => ({
        entries: [] as PatchNotes['entries']
      }))
    ])

    const items: NewsItem[] = news.entries
      .filter((entry) => !entry.newsType?.length || entry.newsType.some((type) => /java|minecraft/i.test(type)))
      .map((entry) => ({
        id: `news-${entry.id}`,
        title: entry.title,
        summary: stripHtml(entry.text ?? '').slice(0, 320),
        url: entry.readMoreLink?.startsWith('http')
          ? entry.readMoreLink
          : `https://www.minecraft.net${entry.readMoreLink ?? ''}`,
        imageUrl: absolute(entry.newsPageImage?.url ?? entry.playPageImage?.url),
        date: entry.date,
        category: entry.category ?? entry.tag ?? 'Minecraft',
        source: 'Minecraft.net'
      }))

    for (const entry of patches.entries.slice(0, 12)) {
      items.push({
        id: `patch-${entry.id}`,
        title: `${entry.title}`,
        summary: stripHtml(entry.shortText ?? entry.body ?? '').slice(0, 320),
        url: `https://www.minecraft.net/en-us/article/minecraft-java-edition-${entry.version.replace(/\./g, '-')}`,
        imageUrl: absolute(entry.image?.url),
        date: entry.date ?? '',
        category: entry.type === 'snapshot' ? 'Snapshot' : 'Release',
        source: 'Patch notes'
      })
    }

    return items
      .filter((item) => item.title)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 40)
  }

  try {
    return refresh ? await load() : await cached('mojang-news', TTL, load)
  } catch (err) {
    log.warn('news', 'Could not load the Minecraft news feed', err)
    return []
  }
}
