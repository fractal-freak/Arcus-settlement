/** Hosted runners share a renderer name, not a machine or performance budget. */
export function baselineScope(env = process.env) {
  if (!env.CI) return 'local';
  if (!env.GITHUB_RUN_ID || !env.GITHUB_JOB || !env.GITHUB_RUN_ATTEMPT) {
    throw new Error('CI performance checks require a run, attempt and job identity');
  }
  return `${env.GITHUB_RUN_ID}:${env.GITHUB_RUN_ATTEMPT}:${env.GITHUB_JOB}`;
}
export function comparableBaseline(before, after) {
  return !!before && before.backend === after.backend && before.scope === after.scope;
}
