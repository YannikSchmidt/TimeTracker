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

/** „4711 · Halter links“ bzw. nur die Nummer, wenn keine Benennung gepflegt ist. */
export function articleLabel(article: Article): string {
  return article.name ? `${article.number} · ${article.name}` : article.number;
}

/**
 * Zusatzinfos zum Artikel neben dem Timer-Namen (der die Benennung schon enthält):
 * Artikelnummer (falls eine Benennung gepflegt ist) und Endgerät.
 */
export function articleDetails(article: Article): string[] {
  return [article.name ? `Art. ${article.number}` : '', article.device.trim()].filter(Boolean);
}

/**
 * Suche in Nummer, Benennung und Endgerät (ohne Groß/Klein).
 * Reihenfolge: Nummer beginnt mit …, Benennung beginnt mit …, Rest; sonst wie in der Liste.
 */
export function matchArticles(articles: Article[], query: string, limit = Infinity): Article[] {
  const q = query.trim().toLowerCase();
  if (!q) return articles.slice(0, limit);
  const rank = (a: Article) => {
    if (a.number.toLowerCase().startsWith(q)) return 0;
    const words = a.name.toLowerCase().split(/[\s\-–·,/]+/);
    return words.some((w) => w.startsWith(q)) ? 1 : 2;
  };
  return articles
    .filter((a) => [a.number, a.name, a.device].some((s) => s.toLowerCase().includes(q)))
    .map((a, i) => ({ a, i, r: rank(a) }))
    .sort((x, y) => x.r - y.r || x.i - y.i)
    .map((x) => x.a)
    .slice(0, limit);
}

/** Artikel, dessen Benennung genau dem Text entspricht (ohne Groß/Klein) – nur wenn eindeutig. */
export function findArticleByName(articles: Article[], text: string): Article | null {
  const q = text.trim().toLowerCase();
  if (!q) return null;
  const hits = articles.filter((a) => a.name.trim().toLowerCase() === q);
  return hits.length === 1 ? hits[0] : null;
}
