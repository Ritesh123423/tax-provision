# Audit website multi-agent pipeline

Seven subagent definitions for building your audit compliance website in Claude Code, matching the pipeline discussed in chat. This README covers: installing Claude Code, installing these agents, and running the pipeline correctly.

---

## 1. Install Claude Code

Claude Code is the terminal/desktop tool that can actually use these subagent files (this chat interface can't run them directly).

**Requirement:** a paid Claude plan (Pro, Max, Team, Enterprise) or a Claude Console/API account. The free claude.ai chat plan does not include Claude Code.

**macOS / Linux / WSL** — open a terminal and run:
```bash
curl -fsSL https://claude.ai/install.sh | bash
```

**Windows** — open PowerShell (not CMD) and run:
```powershell
irm https://claude.ai/install.ps1 | iex
```

**Alternative (any OS with Node.js 18+):**
```bash
npm install -g @anthropic-ai/claude-code
```

After installing, verify it worked:
```bash
claude --version
claude doctor
```

Then start it inside your project folder and log in when prompted:
```bash
cd your-project-folder
claude
```

---

## 2. Install the subagents

Subagents are just markdown files Claude Code reads from a folder. Two options:

**Project-level (recommended — shareable via git, scoped to this project):**
```bash
mkdir -p .claude/agents
# copy all 7 .md files from this folder into .claude/agents/
```

**User-level (available in every project on your machine):**
```bash
mkdir -p ~/.claude/agents
# copy all 7 .md files there instead
```

Claude Code auto-detects new agent files within a few seconds while running. If you added the very first agent file to a brand-new `agents/` folder, restart Claude Code once so it picks up the folder itself.

Check they loaded:
```bash
/agents
```
(or just ask Claude: "what subagents do I have available?")

---

## 3. Run the pipeline in the right order

These agents have real dependencies — don't run them all at once and hope for the best. Work through them roughly in this order, giving Claude Code your actual project context (jurisdiction: India + international, the specific audit workflows you need, etc.) at each stage.

**Stage 1 — parallel, kick off together:**
```text
Use the ui-ux-designer subagent to design the site structure for an audit
compliance web app covering entity setup, risk assessment, materiality,
sampling, evidence collection, and reporting.
```
```text
Use the audit-knowledge-agent subagent to research Ind AS, IFRS, SA, ISA,
Companies Act 2013, and Income Tax Act requirements for [the specific
audit area you're starting with] and produce a requirements checklist.
```
You can literally ask Claude to run both "in parallel using separate subagents" in one message — Claude Code supports this natively.

**Stage 2 — depends on stage 1 outputs:**
```text
Use the style-agent subagent to apply a professional design system to the
screens the ui-ux-designer just defined.
```
```text
Use the audit-logic-agent subagent to implement the formulas from the
audit-knowledge-agent's requirements checklist.
```

**Stage 3 — you (or the main session) integrate:**
Ask Claude directly (main conversation, not a subagent) to wire the styled screens together with the logic layer into a working build. This integration step needs judgment and back-and-forth, so it belongs in the main conversation, not an isolated subagent.

**Stage 4 — sequential, one at a time:**
```text
Use the testing-agent subagent to test the build with dummy audit data.
```
```text
Use the final-review-agent subagent to do a final go/no-go review.
```
```text
Use the bugfinder-delivery-agent subagent to fix remaining blocking
issues and package the final files.
```

---

## 4. Notes on how this actually behaves

- Each subagent starts with a **fresh, empty context** — it doesn't automatically see what previous agents did. When you invoke one, tell Claude (or let Claude tell it) what the prior agent produced — e.g. "here's the requirements checklist the knowledge agent wrote, now build the formulas from it." Point it at the actual files (screens.md, requirements-checklist.md, etc.) rather than assuming it remembers.
- The **audit-knowledge-agent is the one to trust least on autopilot.** Compliance research needs your review — treat its output as a draft checklist to verify, not gospel, especially anywhere it flags "needs verification."
- You can rename subagents, tighten their tool access, or split any of them further (e.g. a separate "Ind AS agent" and "Companies Act agent") — these seven are a solid starting shape, not a fixed law.
- If a subagent's response feels shallow because it lacks context, that's almost always a "you didn't hand it the right file/summary" problem, not a subagent-design problem.

---

## 5. Files in this folder

| File | Role |
|---|---|
| `ui-ux-designer.md` | Site structure, navigation, user flows |
| `style-agent.md` | Visual design system |
| `audit-knowledge-agent.md` | Ind AS/IFRS/SA/ISA/Companies Act/IT Act research → requirements checklist |
| `audit-logic-agent.md` | Formulas and computations, built from the checklist |
| `testing-agent.md` | Tests the build with dummy audit data |
| `final-review-agent.md` | Holistic go/no-go review |
| `bugfinder-delivery-agent.md` | Fixes blocking bugs, packages final delivery |
