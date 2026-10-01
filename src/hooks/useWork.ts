import { useMemo } from 'react';

import { useQuery } from '../data/DataProvider';
import { entriesByJob, segmentsWithJob } from '../domain/jobs';
import { DEFAULT_SETTINGS, type Entry, type Job, type Segment, type Settings } from '../domain/types';
import { useTeam } from '../sync/TeamContext';

/** Aufträge + Abschnitte mit abgeleiteten Nachschlage-Tabellen. */
export interface WorkView {
  jobs: Job[];
  entries: Entry[];
  jobsById: Map<string, Job>;
  entriesOf: Map<string, Entry[]>;
  segments: Segment[];
}

/** Personenfilter: 'me' = eigene, 'all' = ganzes Team, sonst GitHub-Login. */
export type OwnerFilter = 'me' | 'all' | string;

export interface WorkData extends WorkView {
  loaded: boolean;
  settings: Settings;
  /** Eigener Login (null ohne Team-Sync) */
  me: string | null;
  /** Logins der anderen Personen im Team */
  others: string[];
  /** Eigene + fremde Daten (fremde nur lesbar) */
  all: WorkView;
  /** Besitzer eines Auftrags (eigene ohne Login → me) */
  ownerOf: (job: Job) => string | null;
  isOwn: (job: Job) => boolean;
  view: (filter: OwnerFilter) => WorkView;
}

function makeView(jobs: Job[], entries: Entry[]): WorkView {
  return {
    jobs,
    entries,
    jobsById: new Map(jobs.map((j) => [j.id, j])),
    entriesOf: entriesByJob(entries),
    segments: segmentsWithJob(entries, jobs),
  };
}

/** Alle Aufträge, Abschnitte und Einstellungen – lädt nach jeder Änderung neu. */
export function useWork(): WorkData {
  const team = useTeam();
  const { data } = useQuery(async (r) => ({
    jobs: await r.jobs.listAll(),
    entries: await r.entries.listAll(),
    settings: await r.settings.get(),
  }));

  return useMemo(() => {
    const ownJobs = data?.jobs ?? [];
    const ownEntries = data?.entries ?? [];
    const own = makeView(ownJobs, ownEntries);
    const otherJobs = team.others.flatMap((m) => m.jobs.filter((j) => !j.deletedAt));
    const otherEntries = team.others.flatMap((m) => m.entries.filter((e) => !e.deletedAt));
    const all = team.others.length > 0 ? makeView([...ownJobs, ...otherJobs], [...ownEntries, ...otherEntries]) : own;
    const ownIds = new Set(ownJobs.map((j) => j.id));
    const me = team.login;
    const isOwn = (job: Job) => ownIds.has(job.id);
    const ownerOf = (job: Job) => (isOwn(job) ? me : job.createdBy);
    const byOwner = new Map(team.others.map((m) => [m.login, makeView(m.jobs.filter((j) => !j.deletedAt), m.entries)]));
    return {
      ...own,
      loaded: data !== undefined,
      settings: data?.settings ?? DEFAULT_SETTINGS,
      me,
      others: team.others.map((m) => m.login),
      all,
      ownerOf,
      isOwn,
      view: (filter: OwnerFilter) => (filter === 'me' ? own : filter === 'all' ? all : (byOwner.get(filter) ?? makeView([], []))),
    };
  }, [data, team.others, team.login]);
}
