from __future__ import annotations
import json, sys
from pathlib import Path
from typing import Any, Dict, List

from scripts.permit import building, plumbing, electrical, addenda, complaint
from scripts import contractor as contractor_contacts
from scripts.insights import contractors as insights_contractors
from scripts.insights import inspectors as insights_inspectors
from scripts.anomalies import contractors as anomalies_contractors
from scripts.anomalies import inspectors as anomalies_inspectors

PERMIT_MODULES = {
    "building": building,
    "plumbing": plumbing,
    "electrical": electrical,
    "addenda": addenda,
    "complaint": complaint,
}

def main(input_path: str) -> None:
    inp = json.loads(Path(input_path).read_text())
    request_id = inp["requestId"]
    payload = inp.get("payload", {})
    permit_types: List[str] = payload.get("permitTypes", ["building","plumbing","electrical","addenda","complaint"])
    soql = payload.get("soql", {})

    rows_out: List[Dict[str, Any]] = []
    stats: Dict[str, Any] = {"modules": []}

    for pt in permit_types:
        mod = PERMIT_MODULES.get(pt)
        if not mod:
            continue
        out = mod.run(mod.InputSpec(request_id=request_id, soql_params=soql))
        stats["modules"].append({"module": f"permit.{pt}", "count": out.stats.get("count", 0)})
        for r in out.rows:
            rows_out.append({
                "entity": r.entity,
                "canonical_key": r.canonical_key,
                "row": r.row,
                "source": getattr(mod, "DATASET_ID", None)
            })

    if payload.get("includeContractorContacts"):
        out = contractor_contacts.run(
            contractor_contacts.InputSpec(
                request_id=request_id,
                soql_params=payload.get("contacts_soql", {})
            )
        )
        stats["modules"].append({"module": "contractor", "count": out.stats.get("count", 0)})
        for r in out.rows:
            rows_out.append({
                "entity": r.entity,
                "canonical_key": r.canonical_key,
                "row": r.row,
                "source": contractor_contacts.DATASET_ID
            })

    if payload.get("includeInsights"):
        for mod in (insights_contractors, insights_inspectors):
            out = mod.run(mod.InputSpec(request_id=request_id, params=payload))
            for r in out.rows:
                rows_out.append({"entity": r.entity, "canonical_key": r.canonical_key, "row": r.row, "source": "insights"})

    if payload.get("includeAnomalies"):
        for mod in (anomalies_contractors, anomalies_inspectors):
            out = mod.run(mod.InputSpec(request_id=request_id, params=payload))
            for r in out.rows:
                rows_out.append({"entity": r.entity, "canonical_key": r.canonical_key, "row": r.row, "source": "anomalies"})

    print(json.dumps({"requestId": request_id, "rows": rows_out, "stats": stats}))

if __name__ == "__main__":
    if len(sys.argv) < 2:
        raise SystemExit("usage: run_bulk_analysis.py /workspace/input.json")
    main(sys.argv[1])
