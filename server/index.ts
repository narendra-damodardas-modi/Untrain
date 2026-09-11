import cors from 'cors'
import express from 'express'
import path from 'node:path'
import { TASKS, TOOL_SPECS, getTask } from './catalog.ts'
import { ensureFixtures, ensureGoldens } from './fixtures.ts'
import { DATA_DIR } from './paths.ts'
import {
  callTool,
  createRun,
  listRuns,
  loadRun,
  runSuite,
  submitRun,
  workspaceListing,
} from './runner.ts'
import type { AgentKind, ToolArgs, ToolName } from './types.ts'

const app = express()
app.use(cors())
app.use(express.json({ limit: '2mb' }))
app.use('/files', express.static(DATA_DIR))

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, ffmpeg: true, llm: Boolean(process.env.OPENAI_API_KEY) })
})

app.get('/api/tools', (_req, res) => {
  res.json({ tools: TOOL_SPECS })
})

app.get('/api/tasks', (_req, res) => {
  res.json({
    tasks: TASKS.map((t) => ({
      id: t.id,
      name: t.name,
      difficulty: t.difficulty,
      instruction: t.instruction,
      inputs: t.inputs,
      checkCount: t.checks.length,
    })),
  })
})

app.get('/api/tasks/:id', (req, res) => {
  try {
    const task = getTask(req.params.id)
    res.json({ task })
  } catch (err) {
    res.status(404).json({ error: err instanceof Error ? err.message : String(err) })
  }
})

app.get('/api/runs', async (_req, res) => {
  res.json({ runs: await listRuns() })
})

app.post('/api/runs', async (req, res) => {
  try {
    const taskId = String(req.body.taskId ?? '')
    const agent = (req.body.agent ?? 'manual') as AgentKind
    const run = await createRun(taskId, agent)
    res.json({ run })
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) })
  }
})

app.get('/api/runs/:id', async (req, res) => {
  try {
    const run = await loadRun(req.params.id)
    const workspace = await workspaceListing(req.params.id)
    res.json({ run, workspace })
  } catch (err) {
    res.status(404).json({ error: err instanceof Error ? err.message : String(err) })
  }
})

app.post('/api/runs/:id/tool', async (req, res) => {
  try {
    const tool = req.body.tool as ToolName
    const args = (req.body.args ?? {}) as ToolArgs
    const run = await callTool(req.params.id, tool, args)
    const workspace = await workspaceListing(req.params.id)
    res.json({ run, workspace })
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) })
  }
})

app.post('/api/runs/:id/submit', async (req, res) => {
  try {
    const run = await submitRun(req.params.id)
    const workspace = await workspaceListing(req.params.id)
    res.json({ run, workspace })
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) })
  }
})

app.post('/api/suite', async (req, res) => {
  try {
    const agent = (req.body.agent ?? 'oracle') as AgentKind
    const runs = await runSuite(agent)
    res.json({ runs })
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) })
  }
})

const port = Number(process.env.PORT ?? 8787)

async function main(): Promise<void> {
  await ensureFixtures()
  await ensureGoldens()
  app.listen(port, '0.0.0.0', () => {
    console.log(`video-harness server on http://127.0.0.1:${port}`)
    console.log(`fixtures ${path.join(DATA_DIR, 'fixtures')}`)
  })
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
