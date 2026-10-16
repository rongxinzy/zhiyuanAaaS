"""Minimal CI inventory: one PR workflow with verify + ci-gate job names."""
import json
from pathlib import Path

import yaml

root = Path(__file__).resolve().parent
config = json.loads((root / "devops-ci.json").read_text(encoding="utf-8"))
orchestrator = config["orchestrator"]
workflow_path = root.parent / orchestrator["path"]
data = yaml.safe_load(workflow_path.read_text(encoding="utf-8"))
events = data.get("on", data.get(True, {}))
if isinstance(events, str):
    events = {events: None}
assert "pull_request" in events, "CI must run on pull_request"
jobs = data.get("jobs", {})
for name in orchestrator["requiredJobs"]:
    assert name in jobs, f"Missing required job for branch protection: {name}"
    assert jobs[name].get("name", name) == name, f"Job {name} must publish check context {name}"
gate = yaml.safe_load((root / "workflows/devops-gate.yml").read_text(encoding="utf-8"))
gate_events = gate.get("on", gate.get(True, {}))
assert gate_events == {"workflow_dispatch": None}, "Legacy DevOps gate must not run on PRs"
print(f"PASS: {orchestrator['name']} exposes {', '.join(orchestrator['requiredJobs'])}")
