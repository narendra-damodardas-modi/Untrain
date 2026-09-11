# Video Harness

An **AI eval harness for video**, in the same role a coding harness plays for software agents: isolated sandbox, constrained tools, hidden checks, traces, and a score.

This is not a consumer video editor. The UI is a lab console for running agents, inspecting tool traces, comparing output vs golden frames, and reading check results.

## Layout

```
agent  --tools-->  sandbox (ffmpeg)  --output.mp4-->  checks (duration, size, audio, PSNR, color)
                     ^
                     |
              task instruction + inputs/
```

- **Oracle agent** replays the gold tool sequence so the harness can certify itself.
- **Manual agent** is the same tool API a model would call (human-in-the-loop).
- **LLM agent** optional: `OPENAI_API_KEY` (+ optional `OPENAI_BASE_URL`, `OPENAI_MODEL`).

## Run

```bash
npm install
npm run dev          # API :8787  UI :5173
npm test             # oracle over the full task suite
```

Open `http://localhost:5173`. Use **Run oracle suite** to score every task.

## Agent protocol

Each run copies task fixtures into a sandbox:

- `inputs/` — readable source media
- `output.mp4` — the file checks grade
- `golden.mp4` — hidden reference (not needed by the agent)

Tools: `list_files`, `probe`, `extract_frame`, `trim`, `concat`, `overlay_text`, `scale`, `crop`, `mute`, `set_volume`, `set_fps`, `set_speed`.

HTTP:

- `POST /api/runs` `{ taskId, agent }`
- `POST /api/runs/:id/tool` `{ tool, args }`
- `POST /api/runs/:id/submit`

Checks are the video equivalent of unit tests: duration, resolution, fps, audio presence, sampled pixel color, and PSNR against the golden encode.
