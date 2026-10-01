import { router } from 'expo-router';

import { useData } from '../data/DataProvider';
import type { Job } from '../domain/types';

/** Pausieren, Fortsetzen, Beenden und Nacharbeit – einheitlich für alle Bildschirme. */
export function useJobActions() {
  const { mutate } = useData();
  return {
    pause: (job: Job) => mutate((r) => r.jobs.pause(job.id)),
    resume: (job: Job) => mutate((r) => r.jobs.resume(job.id)),
    /** Auftrag: sofort beenden und Abschluss zeigen. Nacharbeit: erst Grund abfragen. */
    finish: async (job: Job) => {
      if (job.kind === 'rework') {
        await mutate((r) => r.jobs.pause(job.id));
        router.push(`/rework-reason/${job.id}`);
        return;
      }
      await mutate((r) => r.jobs.finish(job.id));
      router.push({ pathname: '/job/[id]', params: { id: job.id, done: '1' } });
    },
    /** Startet sofort eine Nacharbeit zu diesem Auftrag (laufender Timer wird pausiert). */
    startRework: (job: Job) =>
      mutate((r) =>
        r.jobs.start({
          kind: 'rework',
          parentJobId: job.kind === 'rework' ? job.parentJobId : job.id,
          orderNo: job.orderNo,
          articleId: job.articleId,
          valueIds: job.valueIds,
        }),
      ),
  };
}
