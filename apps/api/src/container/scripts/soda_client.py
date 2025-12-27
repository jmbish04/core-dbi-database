from __future__ import annotations
import os
from dataclasses import dataclass
from typing import Dict, Optional, Any
import httpx

DEFAULT_BASE = os.getenv("SODA_BASE", "https://data.sfgov.org/resource")

@dataclass
class SodaClient:
    base: str = DEFAULT_BASE
    app_token: Optional[str] = os.getenv("SODA_APP_TOKEN")

    def _headers(self) -> Dict[str, str]:
        h = {"Accept": "application/json"}
        if self.app_token:
            h["X-App-Token"] = self.app_token
        return h

    def get_json(self, dataset_id: str, params: Dict[str, Any]) -> Any:
        url = f"{self.base.rstrip('/')}/{dataset_id}.json"
        with httpx.Client(timeout=60.0, headers=self._headers()) as c:
            r = c.get(url, params=params)
            r.raise_for_status()
            return r.json()
