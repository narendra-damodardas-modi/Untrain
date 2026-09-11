import type { AgentKind, RunRecord, TaskSummary, ToolSpec, Workspace } from './types.ts'

async function parse<T>(res: Response): Promise<T> {
  const body = (await res.json()) as T & { error?: string }
  if (!res.ok) throw new Error(body.error || res.statusText)
  return body
}

export async function getHealth(): Promise<{ ok: boolean; llm: boolean }> {
  return parse(await fetch('/api/health'))
}

export async function getTasks(): Promise<TaskSummary[]> {
  const data = await parse<{ tasks: TaskSummary[] }>(await fetch('/api/tasks'))
  return data.tasks
}

export async function getTools(): Promise<ToolSpec[]> {
  const data = await parse<{ tools: ToolSpec[] }>(await fetch('/api/tools'))
  return data.tools
}

export async function getRuns(): Promise<RunRecord[]> {
  const data = await parse<{ runs: RunRecord[] }>(await fetch('/api/runs'))
  return data.runs
}

export async function createRun(
  taskId: string,
  agent: AgentKind,
): Promise<RunRecord> {
  const data = await parse<{ run: RunRecord }>(
    await fetch('/api/runs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ taskId, agent }),
    }),
  )
  return data.run
}

export async function getRun(id: string): Promise<{ run: RunRecord; workspace: Workspace }> {
  return parse(await fetch(`/api/runs/${id}`))
}

export async function callTool(
  id: string,
  tool: string,
  args: Record<string, unknown>,
): Promise<{ run: RunRecord; workspace: Workspace }> {
  return parse(
    await fetch(`/api/runs/${id}/tool`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tool, args }),
    }),
  )
}

export async function submitRun(id: string): Promise<{ run: RunRecord; workspace: Workspace }> {
  return parse(await fetch(`/api/runs/${id}/submit`, { method: 'POST' }))
}

export async function runSuite(agent: AgentKind): Promise<RunRecord[]> {
  const data = await parse<{ runs: RunRecord[] }>(
    await fetch('/api/suite', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ agent }),
    }),
  )
  return data.runs
}
