from __future__ import annotations
import re
from typing import Optional

_SUFFIX_RE = re.compile(r"\b(inc|inc\.|llc|l\.l\.c\.|corp|corporation|co|company|ltd|limited)\b", re.I)

def norm_whitespace(s: str) -> str:
    return re.sub(r"\s+", " ", s).strip()

def norm_company_name(s: str) -> str:
    s = norm_whitespace(s)
    s = s.replace("&", "and")
    s = re.sub(r"[^a-zA-Z0-9\s\-']", " ", s)
    s = _SUFFIX_RE.sub("", s)
    return norm_whitespace(s).upper()

def norm_license(s: Optional[str]) -> Optional[str]:
    if not s:
        return None
    s = re.sub(r"[^0-9A-Za-z]", "", s).strip()
    return s or None

def parse_street_address(full: str) -> dict:
    full = norm_whitespace(full)
    m = re.match(
        r"^(\d+)\s+(.+?)\s+(st|street|ave|avenue|blvd|boulevard|rd|road|dr|drive|ln|lane|ct|court|pl|place)\b\.?$",
        full,
        re.I,
    )
    if not m:
        return {"street_number": None, "street_name": None, "street_suffix": None, "raw": full}
    return {
        "street_number": m.group(1),
        "street_name": m.group(2),
        "street_suffix": m.group(3).upper(),
        "raw": full,
    }
