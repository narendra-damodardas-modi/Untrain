import { useCallback, useEffect, useMemo, useState } from 'react'
import * as api from './api.ts'
import type { AgentKind, RunRecord, TaskSummary, ToolSpec, Workspace } from './types.ts'

const AGENTS: Array<{ id: AgentKind; label: string; hint: string }> = [
  { id: 'oracle', label: 'Oracle', hint: 'Gold solution — verifies the harness, not the model' },
  { id: 'manual', label: 'Manual', hint: 'You are the agent: call tools, then submit' },
  { id: 'llm', label: 'LLM', hint: 'Needs OPENAI_API_KEY on the server' },
]

function statusClass(status: string): string {
  if (status === 'passed') return 'ok'
  if (status === 'failed' || status === 'error') return 'bad'
  if (status === 'running') return 'run'
  return 'idle'
}

export default function App() {
  const [tasks, setTasks] = useState<TaskSummary[]>([])
  const [tools, setTools] = useState<ToolSpec[]>([])
  const [runs, setRuns] = useState<RunRecord[]>([])
  const [taskId, setTaskId] = useState<string>('')
  const [agent, setAgent] = useState<AgentKind>('oracle')
  const [run, setRun] = useState<RunRecord | null>(null)
  const [workspace, setWorkspace] = useState<Workspace | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [llmReady, setLlmReady] = useState(false)
  const [toolName, setToolName] = useState('probe')
  const [toolArgs, setToolArgs] = useState('{"path":"inputs/clip.mp4"}')
  const [suiteBusy, setSuiteBusy] = useState(false)

  const task = tasks.find((t) => t.id === taskId) ?? tasks[0]

  const refreshLists = useCallback(async () => {
    const [t, spec, r, health] = await Promise.all([
      api.getTasks(),
      api.getTools(),
      api.getRuns(),
      api.getHealth(),
    ])
    setTasks(t)
    setTools(spec)
    setRuns(r)
    setLlmReady(health.llm)
    setTaskId((id) => id || t[0]?.id || '')
    if (spec[1]) setToolName((n) => n || spec[1].name)
  }, [])

  useEffect(() => {
    refreshLists().catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
  }, [refreshLists])

  useEffect(() => {
    if (!run || run.status !== 'running') return
    const timer = setInterval(() => {
      api
        .getRun(run.id)
        .then(({ run: next, workspace: ws }) => {
          setRun(next)
          setWorkspace(ws)
          if (next.status !== 'running') {
            void refreshLists()
          }
        })
        .catch(() => undefined)
    }, 400)
    return () => clearInterval(timer)
  }, [run, refreshLists])

  const latestByTask = useMemo(() => {
    const map = new Map<string, RunRecord>()
    for (const item of runs) {
      if (!map.has(item.taskId)) map.set(item.taskId, item)
    }
    return map
  }, [runs])

  async function startRun() {
    if (!task) return
    setBusy(true)
    setError(null)
    try {
      const created = await api.createRun(task.id, agent)
      const detail = await api.getRun(created.id)
      setRun(detail.run)
      setWorkspace(detail.workspace)
      await refreshLists()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function onCallTool() {
    if (!run) return
    setBusy(true)
    setError(null)
    try {
      const args = JSON.parse(toolArgs) as Record<string, unknown>
      const detail = await api.callTool(run.id, toolName, args)
      setRun(detail.run)
      setWorkspace(detail.workspace)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function onSubmit() {
    if (!run) return
    setBusy(true)
    setError(null)
    try {
      const detail = await api.submitRun(run.id)
      setRun(detail.run)
      setWorkspace(detail.workspace)
      await refreshLists()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function onSuite() {
    setSuiteBusy(true)
    setError(null)
    try {
      const results = await api.runSuite('oracle')
      await refreshLists()
      const last = results[results.length - 1]
      if (last) {
        const detail = await api.getRun(last.id)
        setRun(detail.run)
        setWorkspace(detail.workspace)
        setTaskId(last.taskId)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSuiteBusy(false)
    }
  }

  const mp4 = workspace?.videos.filter((v) => v.path.endsWith('.mp4')) ?? []
  const inputVid = mp4.find((v) => v.path.startsWith('inputs/'))
  const outputVid = mp4.find((v) => v.path === 'output.mp4')
  const goldenVid = mp4.find((v) => v.path === 'golden.mp4')
  const selectedSpec = tools.find((t) => t.name === toolName)

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <span className="mark" aria-hidden="true" />
          <div>
            <h1>Video Harness</h1>
            <p>AI agent eval sandbox — tools, traces, video checks. Not an NLE.</p>
          </div>
        </div>
        <div className="top-actions">
          <button type="button" className="ghost" onClick={() => void refreshLists()}>
            Refresh
          </button>
          <button type="button" className="primary" disabled={suiteBusy} onClick={() => void onSuite()}>
            {suiteBusy ? 'Scoring suite…' : 'Run oracle suite'}
          </button>
        </div>
      </header>

      <aside className="rail">
        <div className="rail-h">Tasks</div>
        {tasks.map((item) => {
          const latest = latestByTask.get(item.id)
          return (
            <button
              type="button"
              key={item.id}
              className={`task ${item.id === task?.id ? 'on' : ''}`}
              onClick={() => setTaskId(item.id)}
            >
              <span className={`pip ${statusClass(latest?.status ?? '')}`} />
              <span className="task-body">
                <strong>{item.name}</strong>
                <em>
                  {item.id} · {item.difficulty} · {item.checkCount} checks
                </em>
              </span>
            </button>
          )
        })}
      </aside>

      <section className="brief">
        <div className="kicker">Agent instruction</div>
        <h2>{task?.name ?? '—'}</h2>
        <pre className="instruction">{task?.instruction}</pre>
        <div className="agents">
          {AGENTS.map((a) => (
            <label key={a.id} className={agent === a.id ? 'on' : ''}>
              <input
                type="radio"
                name="agent"
                checked={agent === a.id}
                onChange={() => setAgent(a.id)}
              />
              <span>
                <strong>
                  {a.label}
                  {a.id === 'llm' && !llmReady ? ' (no key)' : ''}
                </strong>
                <em>{a.hint}</em>
              </span>
            </label>
          ))}
        </div>
        <button type="button" className="primary wide" disabled={busy || !task} onClick={() => void startRun()}>
          {busy ? 'Working…' : `Start ${agent} run`}
        </button>
        {error ? <div className="err">{error}</div> : null}
      </section>

      <section className="stage">
        <div className="stage-grid">
          <VideoPane title="Input" src={inputVid?.url} />
          <VideoPane title="Agent output" src={outputVid?.url} />
          <VideoPane title="Golden" src={goldenVid?.url} />
        </div>
        {run?.previews?.length ? (
          <div className="frames">
            <div className="kicker">Frame diffs vs golden</div>
            <div className="frame-row">
              {run.previews.map((frame) => (
                <div key={frame.time} className="frame-card">
                  <span>t={frame.time}s</span>
                  <div className="thumbs">
                    {frame.output ? <img src={frame.output} alt="output frame" /> : null}
                    {frame.golden ? <img src={frame.golden} alt="golden frame" /> : null}
                    {frame.diff ? <img src={frame.diff} alt="difference" /> : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      <section className="tools">
        <div className="kicker">Tool console</div>
        <p className="hint">
          Same action space an AI agent gets. Manual mode: probe, transform, then submit for checks
          (pytest-for-video).
        </p>
        <div className="tool-row">
          <select
            value={toolName}
            onChange={(e) => {
              const name = e.target.value
              setToolName(name)
              const spec = tools.find((t) => t.name === name)
              const draft: Record<string, unknown> = {}
              for (const arg of spec?.args ?? []) {
                if (arg.type === 'number') draft[arg.name] = 0
                else if (arg.type === 'string[]') draft[arg.name] = []
                else draft[arg.name] = ''
              }
              setToolArgs(JSON.stringify(draft, null, 2))
            }}
          >
            {tools.map((t) => (
              <option key={t.name} value={t.name}>
                {t.name}
              </option>
            ))}
          </select>
          <button type="button" disabled={busy || !run || run.status === 'passed' || run.status === 'failed'} onClick={() => void onCallTool()}>
            Call tool
          </button>
          <button type="button" className="accent" disabled={busy || !run} onClick={() => void onSubmit()}>
            Submit / score
          </button>
        </div>
        {selectedSpec ? <p className="hint">{selectedSpec.summary}</p> : null}
        <textarea value={toolArgs} onChange={(e) => setToolArgs(e.target.value)} spellCheck={false} />
        <div className="kicker">Workspace</div>
        <ul className="files">
          {(workspace?.files ?? []).map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      </section>

      <section className="trace">
        <div className="kicker">
          Run {run ? run.id : '—'} · {run?.status ?? 'idle'}
          {run?.score ? ` · ${run.score.passed}/${run.score.total}` : ''}
        </div>
        <div className="score">
          {(run?.score?.checks ?? []).map((c, i) => (
            <div key={i} className={`check ${c.passed ? 'ok' : 'bad'}`}>
              <strong>{String(c.check.type)}</strong>
              <span>{c.detail}</span>
            </div>
          ))}
          {run?.error ? <div className="check bad">{run.error}</div> : null}
        </div>
        <ol className="calls">
          {(run?.trace ?? []).map((item, i) => (
            <li key={`${item.startedAt}-${i}`} className={item.ok ? 'ok' : 'bad'}>
              <code>
                {item.tool}({JSON.stringify(item.args)})
              </code>
              <span>
                {item.ok ? item.stdout : item.error} · {item.durationMs}ms
              </span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  )
}

function VideoPane({ title, src }: { title: string; src?: string }) {
  return (
    <figure>
      <figcaption>{title}</figcaption>
      {src ? <video src={src} controls playsInline /> : <div className="empty">no media</div>}
    </figure>
  )
}
