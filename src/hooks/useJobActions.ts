import { router } from 'expo-router';

import { useData } from '../data/DataProvider';
import type { Repositories } from '../repositories/types';
import { targetKey } from '../domain/targets';
import type { Article, Job } from '../domain/types';

/** Wird ein ausgeblendeter Schritt wieder gewählt, gehört er wieder in die Auswahl. */
async function unhide(r: Repositories, job: Job, article: Article | undefined, step: string) {
  const key = targetKey(job.section, step);
  if (article?.hiddenSteps?.includes(key)) await r.articles.update(article.id, { hiddenSteps: article.hiddenSteps.filter((k) => k !== key) });
}

/** Pausieren, Fortsetzen, Beenden und Nacharbeit – einheitlich für alle Bildschirme. */
export function useJobActions() {
  const { mutate } = useData();
  return {
    pause: (job: Job) => mutate((r) => r.jobs.pause(job.id)),
    resume: (job: Job) => mutate((r) => r.jobs.resume(job.id)),
    /** Arbeitsschritt abschließen, mit dem nächsten weitermachen (Zeit läuft weiter) */
    nextStep: (job: Job, next: string | null) => mutate((r) => r.jobs.nextStep(job.id, next)),
    /** Bisherige Zeit (seit Start bzw. letztem Wechsel) zählt zum gewählten Schritt; die Zeit läuft dort weiter */
    takeOverStep: (job: Job, step: string, article?: Article) =>
      mutate(async (r) => {
        await r.jobs.relabelStep(job.id, step);
        await unhide(r, job, article, step);
      }),
    /** Auf einen beliebigen Arbeitsschritt wechseln – die Zeit wird ab jetzt auf diesen Schritt gebucht */
    switchStep: (job: Job, step: string, article?: Article) =>
      step === job.currentStep
        ? Promise.resolve()
        : mutate(async (r) => {
            await r.jobs.nextStep(job.id, step);
            await unhide(r, job, article, step);
          }),
    /** Schritt in den eigenen Aufträgen umbenennen; der alte Name verschwindet aus der Auswahl des Artikels */
    renameStep: (job: Job, article: Article | undefined, from: string, to: string) =>
      mutate(async (r) => {
        await r.jobs.renameStep({ articleId: job.articleId, section: job.section ?? null, jobId: job.id }, from, to);
        if (article) {
          const hidden = (article.hiddenSteps ?? []).filter((k) => k !== targetKey(job.section, to));
          await r.articles.update(article.id, { hiddenSteps: [...hidden, targetKey(job.section, from)] });
        }
      }),
    /** Schritt aus der Auswahl des Artikels entfernen (gebuchte Zeiten bleiben) */
    hideStep: (job: Job, article: Article, step: string) =>
      mutate((r) => r.articles.update(article.id, { hiddenSteps: [...(article.hiddenSteps ?? []), targetKey(job.section, step)] })),
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
