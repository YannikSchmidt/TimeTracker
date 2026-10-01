import { useMemo } from 'react';

import { useQuery } from '../data/DataProvider';
import { entriesByJob, segmentsWithJob } from '../domain/jobs';
import { DEFAULT_SETTINGS, type Entry, type Job, type Segment, type Settings } from '../domain/types';

export interface WorkData {
  loaded: boolean;
  jobs: Job[];
  entries: Entry[];
  jobsById: Map<string, Job>;
  entriesOf: Map<string, Entry[]>;
  segments: Segment[];
  settings: Settings;
}

/** Alle Aufträge, Abschnitte und Einstellungen – lädt nach jeder Änderung neu. */
export function useWork(): WorkData {
  const { data } = useQuery(async (r) => ({
    jobs: await r.jobs.listAll(),
    entries: await r.entries.listAll(),
    settings: await r.settings.get(),
  }));
  return useMemo(() => {
    const jobs = data?.jobs ?? [];
    const entries = data?.entries ?? [];
    return {
      loaded: data !== undefined,
      jobs,
      entries,
      jobsById: new Map(jobs.map((j) => [j.id, j])),
      entriesOf: entriesByJob(entries),
      segments: segmentsWithJob(entries, jobs),
      settings: data?.settings ?? DEFAULT_SETTINGS,
    };
  }, [data]);
}
