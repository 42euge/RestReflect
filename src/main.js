const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

process.env.MIND_RENDER_PERSONA = "deep-reflect";
process.env.MIND_RENDER_APP_NAME = "MindReflect";
// Gemini API mode: set GEMINI_API_KEY to skip Ollama
// process.env.GEMINI_API_KEY = "your-key-here";

const workspaceRoot = path.resolve(__dirname, "..", "..");
const voiceRoot = path.join(workspaceRoot, "geno-voice");

// Start the voice sidecar (captures mic via PyAudio, broadcasts via WebSocket)
const sidecarScript = path.join(voiceRoot, "pipecat_server.py");
const venvPython = path.join(voiceRoot, ".venv", "bin", "python");
const python = fs.existsSync(venvPython) ? venvPython : "python3";

if (fs.existsSync(sidecarScript)) {
  const sidecarArgs = [sidecarScript];
  if (process.env.MINDREFLECT_TEST_AUDIO) {
    sidecarArgs.push("--test-audio", process.env.MINDREFLECT_TEST_AUDIO);
    if (process.env.MINDREFLECT_TEST_START) sidecarArgs.push("--start", process.env.MINDREFLECT_TEST_START);
    if (process.env.MINDREFLECT_TEST_DURATION) sidecarArgs.push("--duration", process.env.MINDREFLECT_TEST_DURATION);
  }
  const child = spawn(python, sidecarArgs, {
    cwd: voiceRoot,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, PYTHONUNBUFFERED: "1" },
  });
  child.stdout.on("data", (d) => console.log(`[sidecar] ${d.toString().trim()}`));
  child.stderr.on("data", (d) => console.log(`[sidecar] ${d.toString().trim()}`));
  child.on("exit", (code) => console.log(`[sidecar] exited (${code})`));
  process.on("exit", () => { try { child.kill(); } catch {} });
}

// Start voice server for TTS/notes
const voiceServer = path.join(voiceRoot, "server.py");
if (fs.existsSync(voiceServer)) {
  const child = spawn(python, [voiceServer], {
    cwd: voiceRoot,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, PYTHONUNBUFFERED: "1" },
  });
  child.stdout.on("data", (d) => console.log(`[voice] ${d.toString().trim()}`));
  child.stderr.on("data", (d) => console.log(`[voice] ${d.toString().trim()}`));
  child.on("exit", (code) => console.log(`[voice] exited (${code})`));
  process.on("exit", () => { try { child.kill(); } catch {} });
}

require("mind-render");
