export type Difficulty = 'easy' | 'medium' | 'hard'
export type AgentKind = 'oracle' | 'manual' | 'llm'
export type RunStatus = 'ready' | 'running' | 'submitted' | 'passed' | 'failed' | 'error'

export type ToolSpec = {
  name: string
  summary: string
  args: Array<{ name: string; type: string; required?: boolean }>
}

export type TaskSummary = {
  id: string
  name: string
  difficulty: Difficulty
  instruction: string
  inputs: string[]
  checkCount: number
}

export type ToolResult = {
  ok: boolean
  tool: string
  args: Record<string, unknown>
  startedAt: string
  endedAt: string
  durationMs: number
  stdout: string
  stderr: string
  error?: string
  data?: unknown
}

export type CheckResult = {
  check: Record<string, unknown>
  passed: boolean
  detail: string
}

export type FramePreview = {
  time: number
  input?: string
  output?: string
  golden?: string
  diff?: string
}

export type RunRecord = {
  id: string
  taskId: string
  agent: AgentKind
  status: RunStatus
  createdAt: string
  updatedAt: string
  trace: ToolResult[]
  score?: { passed: number; total: number; checks: CheckResult[] }
  error?: string
  previews?: FramePreview[]
}

export type Workspace = {
  files: string[]
  videos: Array<{ path: string; url: string }>
}
