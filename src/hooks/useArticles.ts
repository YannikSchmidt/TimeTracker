import { useMemo } from 'react';

import { useQuery } from '../data/DataProvider';
import type { Article } from '../domain/types';

export interface ArticlesData {
  articles: Article[];
  byId: Map<string, Article>;
  loaded: boolean;
}

export function useArticles(): ArticlesData {
  const { data } = useQuery((r) => r.articles.list());
  return useMemo(
    () => ({ articles: data ?? [], byId: new Map((data ?? []).map((a) => [a.id, a])), loaded: data !== undefined }),
    [data],
  );
}

/** „4711 · Halter“ bzw. nur die Nummer, wenn kein Name gepflegt ist. */
export function articleLabel(article: Article): string {
  return article.name ? `${article.number} · ${article.name}` : article.number;
}

/** Suche in Nummer, Name und Bezeichnung (ohne Groß/Klein). */
export function matchArticles(articles: Article[], query: string, limit = Infinity): Article[] {
  const q = query.trim().toLowerCase();
  if (!q) return articles.slice(0, limit);
  return articles
    .filter((a) => [a.number, a.name, a.description].some((s) => s.toLowerCase().includes(q)))
    .sort((a, b) => Number(!a.number.toLowerCase().startsWith(q)) - Number(!b.number.toLowerCase().startsWith(q)))
    .slice(0, limit);
}
