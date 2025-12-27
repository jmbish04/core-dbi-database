from __future__ import annotations
from typing import Any, Dict, Optional
import pandas as pd
from pydantic import BaseModel, Field

from scripts.soda_client import SodaClient
from scripts.normalize import norm_company_name, norm_license, parse_street_address, norm_whitespace
from scripts.schemas.common import OutputBase, NormalizedRow

DATASET_ID = "3pee-9qhc"
ENTITY = "contractor_contact"

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

    for _, r in df.iterrows():
        raw = r.to_dict()
        company = str(raw.get("company_name") or "")
        contact = str(raw.get("contact_name") or "")
        raw["company_name_norm"] = norm_company_name(company) if company else None
        raw["contact_name_norm"] = norm_whitespace(contact).upper() if contact else None

        lic = str(raw.get("license_number") or raw.get("contractor_license") or "")
        raw["license_norm"] = norm_license(lic) if lic else None

        addr = str(raw.get("address") or raw.get("street_address") or "")
        raw["address_norm"] = parse_street_address(addr) if addr else None

        canonical = raw.get("application_number") or None
        out.rows.append(NormalizedRow(entity=ENTITY, canonical_key=str(canonical) if canonical else None, row=raw))

    out.stats["count"] = len(out.rows)
    return out

if __name__ == "__main__":
    from scripts.cli import main
    main()
