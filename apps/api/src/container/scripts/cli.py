from __future__ import annotations
import argparse, importlib, json
from pathlib import Path
from typing import Any

def load_json(path: str) -> Any:
    return json.loads(Path(path).read_text())

def main() -> None:
    p = argparse.ArgumentParser(description="Run a core-dbi sandbox module.")
    p.add_argument("--module", required=True, help="e.g. permit.building or insights.contractors")
    p.add_argument("--input", required=True, help="Path to input JSON file")
    args = p.parse_args()

    mod = importlib.import_module(f"scripts.{args.module}")
    spec = mod.InputSpec.model_validate(load_json(args.input))
    out = mod.run(spec)
    print(out.model_dump_json())

if __name__ == "__main__":
    main()
