// @appspec:generated — do not edit
import { Cron } from "croner";
import type { FastifyBaseLogger } from "fastify";
import { type JobContext, jobContext } from "./lib/context.js";
import { NotImplemented } from "./lib/errors.js";
import { processDueReminders } from "./slots/processDueReminders.js";

type Job = { id: string; schedule: string; retries: number; slot: (ctx: JobContext) => Promise<void> };

const JOBS: Job[] = [
  { id: "reminderWorker", schedule: "*/5 * * * *", retries: 3, slot: processDueReminders },
];

// Runs in the API process. `protect` skips a tick while the previous run of
// the same job is still going; SKIP LOCKED in slots handles multiple instances.
export function startJobs(log: FastifyBaseLogger): Cron[] {
  return JOBS.map((job) => {
    log.info(`job ${job.id} scheduled: ${job.schedule}`);
    return new Cron(job.schedule, { protect: true }, () => run(job, log));
  });
}

// A failed run is retried up to job.retries times with exponential backoff.
async function run(job: Job, log: FastifyBaseLogger): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      await job.slot(jobContext(log, { id: job.id, attempt, retries: job.retries }));
      return;
    } catch (err) {
      if (err instanceof NotImplemented) {
        log.warn(`job ${job.id}: ${err.message}`);
        return;
      }
      if (attempt > job.retries) {
        log.error({ err }, `job ${job.id} failed after ${attempt} attempts`);
        return;
      }
      log.warn({ err }, `job ${job.id} attempt ${attempt} failed, retrying`);
      await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** (attempt - 1)));
    }
  }
}
