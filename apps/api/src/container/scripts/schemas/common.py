from __future__ import annotations
from pydantic import BaseModel, Field
from typing import Any, Dict, List, Optional

class NormalizedRow(BaseModel):
    entity: str
    canonical_key: Optional[str] = None
    row: Dict[str, Any]

class OutputBase(BaseModel):
    request_id: str
    entity: str
    rows: List[NormalizedRow] = Field(default_factory=list)
    stats: Dict[str, Any] = Field(default_factory=dict)
    warnings: List[str] = Field(default_factory=list)
