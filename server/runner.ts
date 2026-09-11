import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import type { AgentKind, RunRecord, ToolArgs, ToolName, ToolResult } from './types.ts'
import { INPUT_ALIASES, getTask } from './catalog.ts'
import { FIXTURES_DIR, GOLDEN_DIR, RUNS_DIR, ensureDir, pathExists } from './paths.ts'
import { execTool } from './tools.ts'
import { buildPreviews, runChecks } from './evaluate.ts'
import { listRelFiles } from './ffmpeg.ts'
import { runLlmAgent } from './llmAgent.ts'

const runs = new Map<string, RunRecord>()

export function runDir(id: string): string {
  return path.join(RUNS_DIR, id)
}

export async function persist(run: RunRecord): Promise<void> {
  runs.set(run.id, run)
  await ensureDir(runDir(run.id))
  await fs.writeFile(path.join(runDir(run.id), 'run.json'), JSON.stringify(run, null, 2))
}

export async function loadRun(id: string): Promise<RunRecord> {
  const cached = runs.get(id)
  if (cached) return cached
  const file = path.join(runDir(id), 'run.json')
  const raw = JSON.parse(await fs.readFile(file, 'utf8')) as RunRecord
  runs.set(id, raw)
  return raw
}

export async function createRun(taskId: string, agent: AgentKind): Promise<RunRecord> {
  const task = getTask(taskId)
  const id = crypto.randomUUID().slice(0, 8)
  const sandbox = runDir(id)
  await ensureDir(path.join(sandbox, 'inputs'))
  for (const fixture of task.inputs) {
    const alias = INPUT_ALIASES[fixture] ?? fixture
    await fs.copyFile(path.join(FIXTURES_DIR, fixture), path.join(sandbox, 'inputs', alias))
  }
  const goldenSrc = path.join(GOLDEN_DIR, `${task.id}.mp4`)
  if (await pathExists(goldenSrc)) {
    await fs.copyFile(goldenSrc, path.join(sandbox, 'golden.mp4'))
  }
  const now = new Date().toISOString()
  const run: RunRecord = {
    id,
    taskId,
    agent,
    status: agent === 'manual' ? 'ready' : 'running',
    createdAt: now,
    updatedAt: now,
    trace: [],
  }
  await persist(run)
  if (agent === 'oracle') {
    void runOracle(id).catch(async (err) => {
      run.status = 'error'
      run.error = err instanceof Error ? err.message : String(err)
      run.updatedAt = new Date().toISOString()
      await persist(run)
    })
  } else if (agent === 'llm') {
    void runLlm(id).catch(async (err) => {
      run.status = 'error'
      run.error = err instanceof Error ? err.message : String(err)
      run.updatedAt = new Date().toISOString()
      await persist(run)
    })
  }
  return run
}

export async function callTool(id: string, tool: ToolName, args: ToolArgs): Promise<RunRecord> {
  const run = await loadRun(id)
  if (run.status === 'passed' || run.status === 'failed') {
    throw new Error('run already submitted')
  }
  const started = Date.now()
  const startedAt = new Date().toISOString()
  let result: ToolResult
  try {
    const out = await execTool(runDir(id), tool, args)
    result = {
      ok: true,
      tool,
      args,
      startedAt,
      endedAt: new Date().toISOString(),
      durationMs: Date.now() - started,
      stdout: out.stdout,
      stderr: out.stderr,
      data: out.data as ToolResult['data'],
    }
  } catch (err) {
    result = {
      ok: false,
      tool,
      args,
      startedAt,
      endedAt: new Date().toISOString(),
      durationMs: Date.now() - started,
      stdout: '',
      stderr: '',
      error: err instanceof Error ? err.message : String(err),
    }
  }
  run.trace.push(result)
  run.updatedAt = new Date().toISOString()
  await persist(run)
  return run
}

export async function submitRun(id: string): Promise<RunRecord> {
  const run = await loadRun(id)
  const task = getTask(run.taskId)
  const sandbox = runDir(id)
  const golden = path.join(sandbox, 'golden.mp4')
  const checks = await runChecks(sandbox, task.checks, golden)
  const passed = checks.filter((c) => c.passed).length
  run.score = { passed, total: checks.length, checks }
  run.status = passed === checks.length ? 'passed' : 'failed'
  const files = await listRelFiles(sandbox)
  const primaryInput = files.find((f) => f.startsWith('inputs/') && f.endsWith('.mp4'))
  run.previews = await buildPreviews(id, sandbox, primaryInput)
  run.updatedAt = new Date().toISOString()
  await persist(run)
  return run
}

async function runOracle(id: string): Promise<void> {
  const run = await loadRun(id)
  const task = getTask(run.taskId)
  for (const step of task.solution) {
    const next = await callTool(id, step.tool, step.args)
    const last = next.trace[next.trace.length - 1]
    if (!last?.ok) {
      next.status = 'error'
      next.error = last?.error ?? 'oracle tool failed'
      await persist(next)
      return
    }
  }
  await submitRun(id)
}

async function runLlm(id: string): Promise<void> {
  await runLlmAgent({
    id,
    callTool: (tool, args) => callTool(id, tool as ToolName, args),
    submit: () => submitRun(id),
    load: () => loadRun(id),
    files: async () => (await workspaceListing(id)).files,
  })
}

export async function listRuns(): Promise<RunRecord[]> {
  await ensureDir(RUNS_DIR)
  const ids = await fs.readdir(RUNS_DIR)
  const out: RunRecord[] = []
  for (const id of ids) {
    try {
      out.push(await loadRun(id))
    } catch {
      // skip incomplete dirs
    }
  }
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export async function workspaceListing(id: string): Promise<{
  files: string[]
  videos: Array<{ path: string; url: string }>
}> {
  const sandbox = runDir(id)
  const files = await listRelFiles(sandbox)
  const videos = files
    .filter((f) => f.endsWith('.mp4') || f.endsWith('.png'))
    .map((f) => ({ path: f, url: `/files/runs/${id}/${f}` }))
  return { files, videos }
}

export async function runSuite(agent: AgentKind): Promise<RunRecord[]> {
  const { TASKS } = await import('./catalog.ts')
  const results: RunRecord[] = []
  for (const task of TASKS) {
    const run = await createRun(task.id, agent)
    if (agent === 'manual') {
      results.push(run)
      continue
    }
    for (let i = 0; i < 120; i++) {
      const current = await loadRun(run.id)
      if (['passed', 'failed', 'error', 'ready'].includes(current.status) && current.status !== 'running') {
        results.push(current)
        break
      }
      await new Promise((r) => setTimeout(r, 250))
    }
  }
  return results
}
