import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Aggregate test runner: the unit suite, then the red-team pack.
 *
 * Both steps always run. Chaining them with `&&` in an npm script skipped the pack
 * whenever the unit suite failed, and the shell separators that would fix that (`;`,
 * `&`) are not portable between cmd.exe and sh. This runner uses no shell at all, so
 * the behaviour is the same on every platform.
 *
 * The command exits non-zero if either step fails, so `npm test` stays fail-closed.
 */

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const STEPS: { name: string; args: string[] }[] = [
  { name: "unit suite", args: ["--test"] },
  { name: "red-team pack", args: [join("tests", "redteam", "run.ts")] },
];

let failedSteps = 0;

for (const step of STEPS) {
  console.log("");
  console.log(`=== ${step.name} ===`);

  const result = spawnSync(process.execPath, step.args, { cwd: PROJECT_ROOT, stdio: "inherit" });

  if (result.error) {
    console.log(`=== ${step.name}: could not start (${result.error.message}) ===`);
    failedSteps += 1;
    continue;
  }

  const ok = result.status === 0;
  console.log(`=== ${step.name}: exit ${result.status ?? "killed by signal"} ===`);

  if (!ok) {
    failedSteps += 1;
  }
}

console.log("");
console.log(
  failedSteps === 0
    ? `npm test: all ${STEPS.length} step(s) passed`
    : `npm test: ${failedSteps} of ${STEPS.length} step(s) failed`,
);

process.exitCode = failedSteps === 0 ? 0 : 1;
