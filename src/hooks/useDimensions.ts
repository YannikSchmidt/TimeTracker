import { useMemo } from 'react';

import { useQuery } from '../data/DataProvider';
import type { Dimension, DimensionValue } from '../domain/types';

export interface DimensionsData {
  dimensions: Dimension[];
  enabled: Dimension[];
  values: DimensionValue[];
  valuesById: Map<string, DimensionValue>;
  valuesOf: (dimensionId: string, includeArchived?: boolean) => DimensionValue[];
}

export function useDimensions(): DimensionsData {
  const { data } = useQuery(async (r) => ({
    dimensions: await r.dimensions.listDimensions(),
    values: await r.dimensions.listValues(),
  }));

  return useMemo(() => {
    const dimensions = data?.dimensions ?? [];
    const values = data?.values ?? [];
    return {
      dimensions,
      enabled: dimensions.filter((d) => d.enabled),
      values,
      valuesById: new Map(values.map((v) => [v.id, v])),
      valuesOf: (dimensionId, includeArchived = false) =>
        values.filter((v) => v.dimensionId === dimensionId && (includeArchived || !v.archived)),
    };
  }, [data]);
}
