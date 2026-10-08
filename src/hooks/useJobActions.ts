import { router } from 'expo-router';

import { useData } from '../data/DataProvider';
import type { Job } from '../domain/types';

/** Pausieren, Fortsetzen, Beenden und Nacharbeit – einheitlich für alle Bildschirme. */
export function useJobActions() {
  const { mutate } = useData();
  return {
    pause: (job: Job) => mutate((r) => r.jobs.pause(job.id)),
    resume: (job: Job) => mutate((r) => r.jobs.resume(job.id)),
    /** Arbeitsschritt abschließen, mit dem nächsten weitermachen (Zeit läuft weiter) */
    nextStep: (job: Job, next: string | null) => mutate((r) => r.jobs.nextStep(job.id, next)),
    /** Auf einen beliebigen Arbeitsschritt wechseln – die Zeit wird ab jetzt auf diesen Schritt gebucht */
    /** Bisherige Zeit (seit Start bzw. letztem Wechsel) zählt zum gewählten Schritt; die Zeit läuft dort weiter */
    takeOverStep: (job: Job, step: string) => mutate((r) => r.jobs.relabelStep(job.id, step)),
    switchStep: (job: Job, step: string) => (step === job.currentStep ? Promise.resolve() : mutate((r) => r.jobs.nextStep(job.id, step))),
    /** Personenzähler ändern (laufende Zeit wird ab jetzt mit der neuen Anzahl gezählt) */
    setWorkers: (job: Job, workers: number) => mutate((r) => r.jobs.setWorkers(job.id, workers)),
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
