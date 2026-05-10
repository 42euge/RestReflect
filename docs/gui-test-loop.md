# GUI Test Loop Prompt

Use with `/loop` to iteratively test and build towards the VISION.md milestones.

```
/loop test MindReflect against VISION.md using GUI verification:

1. READ VISION.md — find the first unchecked item in the current milestone (M1, M2, etc.)
2. CHECK current state — read relevant source files across repos (MindReflect, mind-render, deep-reflect, geno-voice) to understand what's implemented
3. LAUNCH the app if not running:
   - cd /Users/euge/code-red/mind-reflect-ws/MindReflect
   - Kill any leftover Electron processes: pkill -9 -f 'MindReflect/node_modules/electron/dist/Electron.app' || true
   - Start in background: npm start &
   - Wait for the window to appear: until osascript -e 'tell application "System Events" to tell application process "Electron" to get title of window 1' 2>/dev/null | grep -q 'MindReflect'; do sleep 2; done
4. SCREENSHOT the current state: screencapture -x /tmp/mindreflect-gui-test.png && read the PNG
5. INTERACT via AppleScript to test the feature:
   - Activate: osascript -e 'tell application "Electron" to activate'
   - Type text: osascript -e 'tell application "System Events" to keystroke "text here"'
   - Press enter: osascript -e 'tell application "System Events" to key code 36'
   - Toggle UI: osascript -e 'tell application "System Events" to keystroke "i" using {command down, option down}'
   - Check window title: osascript -e 'tell application "System Events" to tell application process "Electron" to get title of window 1'
6. SCREENSHOT after interaction: screencapture -x /tmp/mindreflect-gui-after.png && read the PNG
7. EVALUATE — does the feature work as described in VISION.md?
   - If YES: check it off in VISION.md, commit the change, move to next item
   - If NO: implement the fix across whichever repos need it, npm install if deps changed, restart app, re-test from step 4
8. CLEANUP — kill Electron and Ollama processes when done testing:
   - pkill -9 -f 'MindReflect/node_modules/electron/dist/Electron.app' || true
   - pkill -f 'ollama serve' || true (only if we started it)
9. COMMIT all changes across repos with descriptive messages, push to GitHub
10. Report: what was tested, what passed, what was fixed, what's next
```
