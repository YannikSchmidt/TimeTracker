import { useMemo } from 'react';

import { useQuery } from '../data/DataProvider';
import { flowOf, type Flow } from '../domain/flows';
import { DEFAULT_SETTINGS, type Article, type MainGroup, type ProductGroup } from '../domain/types';

export interface GroupsData {
  groups: ProductGroup[];
  byId: Map<string, ProductGroup>;
  /** Untergruppen einer Hauptgruppe, alphabetisch */
  subgroupsOf: (main: MainGroup) => ProductGroup[];
  /** alle bisher verwendeten Schrittnamen (für Vorschläge) */
  knownSteps: string[];
  /** Ablauf eines Artikels */
  flowOf: (article: Article | null | undefined) => Flow;
}

export function useGroups(): GroupsData {
  const { data } = useQuery((r) => r.groups.list());
  const { data: settings } = useQuery((r) => r.settings.get());
  const patterns = settings?.codePatterns ?? DEFAULT_SETTINGS.codePatterns;
  return useMemo(() => {
    const groups = data ?? [];
    const byId = new Map(groups.map((g) => [g.id, g]));
    const known = new Set<string>();
    for (const g of groups) for (const s of g.steps) known.add(s);
    return {
      groups,
      byId,
      subgroupsOf: (main: MainGroup) =>
        groups.filter((g) => g.parentId && g.main === main).sort((a, b) => a.name.localeCompare(b.name, 'de', { sensitivity: 'base' })),
      knownSteps: [...known].sort((a, b) => a.localeCompare(b, 'de')),
      flowOf: (article: Article | null | undefined) => flowOf(article, byId, patterns),
    };
  }, [data, patterns]);
}
