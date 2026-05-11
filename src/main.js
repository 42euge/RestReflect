const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

process.env.MIND_RENDER_PERSONA = "deep-reflect";
process.env.MIND_RENDER_APP_NAME = "MindReflect";
// Gemini API mode: set GEMINI_API_KEY to skip Ollama
// process.env.GEMINI_API_KEY = "your-key-here";

const workspaceRoot = path.resolve(__dirname, "..", "..");
const voiceRoot = path.join(workspaceRoot, "geno-voice");
// Don't auto-start voice server — we use the sidecar or manual start
// Setting MIND_RENDER_VOICE_COMMAND causes a 30s timeout if server is already running

require("mind-render");
