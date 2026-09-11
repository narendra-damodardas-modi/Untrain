import { getTask, TOOL_SPECS } from './catalog.ts'
import type { RunRecord, ToolArgs } from './types.ts'

type LlmHooks = {
  id: string
  callTool: (tool: string, args: ToolArgs) => Promise<RunRecord>
  submit: () => Promise<RunRecord>
  load: () => Promise<RunRecord>
  files: () => Promise<string[]>
}

const SYSTEM = `You are a video editing agent inside Video Harness.
You may only call the provided tools. Never invent file paths outside the sandbox.
Inspect inputs with probe/extract_frame, then emit output.mp4, then call submit.
Keep tool args JSON-serializable.`

export async function runLlmAgent(hooks: LlmHooks): Promise<void> {
  const key = process.env.OPENAI_API_KEY
  const base = process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1'
  const model = process.env.OPENAI_MODEL ?? 'gpt-4.1-mini'
  if (!key) {
    throw new Error('OPENAI_API_KEY is not set. Use the oracle agent or the manual tool console.')
  }
  const run = await hooks.load()
  const task = getTask(run.taskId)
  const files = await hooks.files()
  const tools = TOOL_SPECS.map((spec) => ({
    type: 'function',
    function: {
      name: spec.name,
      description: spec.summary,
      parameters: {
        type: 'object',
        properties: Object.fromEntries(
          spec.args.map((a) => [a.name, { type: jsonSchemaType(a.type) }]),
        ),
        required: spec.args.filter((a) => a.required).map((a) => a.name),
      },
    },
  }))
  tools.push({
    type: 'function',
    function: {
      name: 'submit',
      description: 'Score output.mp4 against the task checks and end the run',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  })

  const messages: Array<Record<string, unknown>> = [
    { role: 'system', content: SYSTEM },
    {
      role: 'user',
      content: `Task: ${task.name}\n\n${task.instruction}\n\nSandbox files:\n${files.join('\n')}`,
    },
  ]

  for (let step = 0; step < 12; step++) {
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${key}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        tools,
        tool_choice: 'auto',
      }),
    })
    if (!res.ok) {
      throw new Error(`LLM HTTP ${res.status}: ${await res.text()}`)
    }
    const body = (await res.json()) as {
      choices: Array<{
        message: {
          role: string
          content?: string
          tool_calls?: Array<{
            id: string
            function: { name: string; arguments: string }
          }>
        }
      }>
    }
    const message = body.choices[0]?.message
    if (!message) throw new Error('empty LLM response')
    messages.push(message)
    const calls = message.tool_calls ?? []
    if (calls.length === 0) {
      await hooks.submit()
      return
    }
    for (const call of calls) {
      const name = call.function.name
      const args = JSON.parse(call.function.arguments || '{}') as ToolArgs
      if (name === 'submit') {
        await hooks.submit()
        return
      }
      const after = await hooks.callTool(name, args)
      const last = after.trace[after.trace.length - 1]
      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        content: JSON.stringify(last ?? { error: 'no result' }),
      })
    }
  }
  await hooks.submit()
}

function jsonSchemaType(t: string): string {
  if (t === 'number') return 'number'
  if (t === 'string[]') return 'array'
  return 'string'
}
