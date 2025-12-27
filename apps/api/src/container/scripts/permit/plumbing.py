from __future__ import annotations
from typing import Any, Dict, Optional
import pandas as pd
from pydantic import BaseModel, Field

from scripts.soda_client import SodaClient
from scripts.normalize import norm_company_name, norm_license, parse_street_address
from scripts.schemas.common import OutputBase, NormalizedRow

DATASET_ID = "k2ra-p3nq"
ENTITY = "permit_plumbing"
CONTRACTOR_NAME_FIELD = "plumbing_contractor_name"
CONTRACTOR_LICENSE_FIELD = "plumbing_contractor_license"

class InputSpec(BaseModel):
    request_id: str
    input_path: Optional[str] = None
    soql_params: Dict[str, Any] = Field(default_factory=dict)

class OutputSpec(OutputBase):
    pass

def _load_df(spec: InputSpec) -> pd.DataFrame:
    if spec.input_path:
        if spec.input_path.lower().endswith(".csv"):
            return pd.read_csv(spec.input_path)
        if spec.input_path.lower().endswith(".json"):
            return pd.read_json(spec.input_path)
        raise ValueError("input_path must end with .csv or .json")
    client = SodaClient()
    rows = client.get_json(DATASET_ID, spec.soql_params)
    return pd.DataFrame(rows)

def run(spec: InputSpec) -> OutputSpec:
    df = _load_df(spec).fillna("")
    out = OutputSpec(request_id=spec.request_id, entity=ENTITY)

    if df.empty:
        out.stats["count"] = 0
        return out

    for _, r in df.iterrows():
        raw = r.to_dict()

        if CONTRACTOR_NAME_FIELD:
            name = str(raw.get(CONTRACTOR_NAME_FIELD) or raw.get("contractor_name") or "")
        else:
            name = str(raw.get("contractor_name") or "")

        if CONTRACTOR_LICENSE_FIELD:
            lic = str(raw.get(CONTRACTOR_LICENSE_FIELD) or raw.get("contractor_license") or "")
        else:
            lic = str(raw.get("contractor_license") or "")

        raw["contractor_name_norm"] = norm_company_name(name) if name else None
        raw["contractor_license_norm"] = norm_license(lic) if lic else None

        addr = str(raw.get("job_address") or raw.get("address") or raw.get("site_address") or "")
        raw["address_norm"] = parse_street_address(addr) if addr else None

        canonical = raw.get("permit_number") or raw.get("parent_permit_number") or raw.get("complaint_number") or raw.get("addenda_number") or None
        out.rows.append(NormalizedRow(entity=ENTITY, canonical_key=str(canonical) if canonical else None, row=raw))

    out.stats["count"] = len(out.rows)
    return out

if __name__ == "__main__":
    from scripts.cli import main
    main()
