import { TASKS } from './catalog.ts'
import { ensureFixtures, ensureGoldens } from './fixtures.ts'
import { createRun, loadRun } from './runner.ts'

await ensureFixtures()
await ensureGoldens()

let failed = 0
for (const task of TASKS) {
  const created = await createRun(task.id, 'oracle')
  for (let i = 0; i < 200; i++) {
    const run = await loadRun(created.id)
    if (run.status !== 'running') {
      const ok = run.status === 'passed'
      const score = run.score ? `${run.score.passed}/${run.score.total}` : run.status
      console.log(`${ok ? 'PASS' : 'FAIL'}  ${task.id}  ${score}`)
      if (!ok) {
        failed += 1
        for (const check of run.score?.checks ?? []) {
          if (!check.passed) console.log('   -', check.detail, JSON.stringify(check.check))
        }
        if (run.error) console.log('   -', run.error)
      }
      break
    }
    await new Promise((r) => setTimeout(r, 150))
  }
}

if (failed) {
  console.error(`\n${failed} task(s) failed`)
  process.exit(1)
}
console.log(`\n${TASKS.length} tasks passed`)
