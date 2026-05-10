const fs = require("fs");
const path = require("path");

process.env.MIND_RENDER_PERSONA = "deep-reflect";
process.env.MIND_RENDER_APP_NAME = "MindReflect";

const workspaceRoot = path.resolve(__dirname, "..", "..");
const voiceRoot = path.join(workspaceRoot, "geno-voice");
const voiceServer = path.join(voiceRoot, "server.py");
if (!process.env.MIND_RENDER_VOICE_COMMAND && fs.existsSync(voiceServer)) {
  const venvPython = path.join(voiceRoot, ".venv", "bin", "python");
  const python = fs.existsSync(venvPython) ? venvPython : "python3";
  process.env.MIND_RENDER_VOICE_CWD = voiceRoot;
  process.env.MIND_RENDER_VOICE_COMMAND = `${python} server.py`;
}

require("mind-render");
