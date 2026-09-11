export type Difficulty = 'easy' | 'medium' | 'hard'

export type ToolName =
  | 'list_files'
  | 'probe'
  | 'extract_frame'
  | 'trim'
  | 'concat'
  | 'overlay_text'
  | 'scale'
  | 'crop'
  | 'mute'
  | 'set_volume'
  | 'set_fps'
  | 'set_speed'

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue }

export type ToolArgs = Record<string, JsonValue>

export type ToolCall = {
  tool: ToolName
  args: ToolArgs
}

export type ToolResult = {
  ok: boolean
  tool: ToolName
  args: ToolArgs
  startedAt: string
  endedAt: string
  durationMs: number
  stdout: string
  stderr: string
  error?: string
  data?: JsonValue
}

export type Check =
  | { type: 'file_exists'; path: string }
  | { type: 'duration'; path: string; seconds: number; tolerance: number }
  | { type: 'resolution'; path: string; width: number; height: number }
  | { type: 'fps'; path: string; fps: number; tolerance: number }
  | { type: 'has_audio'; path: string; value: boolean }
  | { type: 'sample_color'; path: string; time: number; x: number; y: number; rgb: [number, number, number]; tolerance: number }
  | { type: 'psnr'; path: string; reference: 'golden'; minDb: number }

export type CheckResult = {
  check: Check
  passed: boolean
  detail: string
}

export type Task = {
  id: string
  name: string
  difficulty: Difficulty
  instruction: string
  inputs: string[]
  solution: ToolCall[]
  checks: Check[]
}

export type AgentKind = 'oracle' | 'manual' | 'llm'

export type RunStatus = 'ready' | 'running' | 'submitted' | 'passed' | 'failed' | 'error'

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
  score?: {
    passed: number
    total: number
    checks: CheckResult[]
  }
  error?: string
  previews?: FramePreview[]
}

export type ProbeInfo = {
  duration: number
  width: number
  height: number
  fps: number
  hasAudio: boolean
  hasVideo: boolean
  videoCodec?: string
  audioCodec?: string
  sizeBytes: number
}
