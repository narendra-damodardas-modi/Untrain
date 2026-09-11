import { TASKS } from './catalog.ts'
import { ensureFixtures, ensureGoldens } from './fixtures.ts'
import { createRun, loadRun } from './runner.ts'
import type { AgentKind } from './types.ts'

async function waitForRun(id: string): Promise<void> {
  for (let i = 0; i < 200; i++) {
    const run = await loadRun(id)
    if (run.status !== 'running') {
      const score = run.score ? `${run.score.passed}/${run.score.total}` : run.status
      const mark = run.status === 'passed' ? 'PASS' : run.status === 'failed' ? 'FAIL' : run.status.toUpperCase()
      console.log(`${mark.padEnd(6)} ${run.taskId.padEnd(18)} ${score}${run.error ? '  ' + run.error : ''}`)
      return
    }
    await new Promise((r) => setTimeout(r, 200))
  }
  throw new Error(`timeout waiting for ${id}`)
}

async function evalAll(agent: AgentKind): Promise<number> {
  await ensureFixtures()
  await ensureGoldens()
  let failed = 0
  for (const task of TASKS) {
    const run = await createRun(task.id, agent)
    await waitForRun(run.id)
    const done = await loadRun(run.id)
    if (done.status !== 'passed') failed += 1
  }
  return failed
}

const cmd = process.argv[2] ?? 'help'

if (cmd === 'fixtures') {
  await ensureFixtures()
  await ensureGoldens()
  console.log('fixtures and goldens ready')
} else if (cmd === 'eval') {
  const agent = (process.argv[3] ?? 'oracle') as AgentKind
  const failed = await evalAll(agent)
  process.exit(failed ? 1 : 0)
} else {
  console.log(`Usage:
  npm run harness -- fixtures
  npm run harness -- eval [oracle|llm]
  npm test                 # oracle eval of the full suite
`)
}
