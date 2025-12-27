from __future__ import annotations

import json
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable, Optional, Union

BytesLike = Union[bytes, bytearray, memoryview]

def _norm_rel(p: str) -> str:
    # normalize to avoid '/../' surprises while still allowing nested prefixes
    p = p.lstrip("/").replace("\\", "/")
    if p == "":
        raise ValueError("path cannot be empty")
    return p

@dataclass
class R2FS:
    """Filesystem-first R2 helper.

    Intended usage when your Worker mounts an R2 bucket into the sandbox using
    Sandbox SDK's `mountBucket(bucketName, mountPath, ...)`.

    Default mount path: /r2  (override with env R2_MOUNT_PATH)
    """
    mount_path: str = os.getenv("R2_MOUNT_PATH", "/r2")

    def _abs(self, rel: str) -> Path:
        rel = _norm_rel(rel)
        return Path(self.mount_path) / rel

    def exists(self, rel: str) -> bool:
        return self._abs(rel).exists()

    def mkdirs(self, rel_dir: str) -> None:
        self._abs(rel_dir).mkdir(parents=True, exist_ok=True)

    def read_bytes(self, rel: str) -> bytes:
        return self._abs(rel).read_bytes()

    def read_text(self, rel: str, encoding: str = "utf-8") -> str:
        return self._abs(rel).read_text(encoding=encoding)

    def read_json(self, rel: str) -> Any:
        return json.loads(self.read_text(rel))

    def write_bytes(self, rel: str, data: BytesLike) -> None:
        p = self._abs(rel)
        p.parent.mkdir(parents=True, exist_ok=True)
        tmp = p.with_suffix(p.suffix + ".tmp")
        tmp.write_bytes(bytes(data))
        tmp.replace(p)  # atomic on same filesystem

    def write_text(self, rel: str, data: str, encoding: str = "utf-8") -> None:
        self.write_bytes(rel, data.encode(encoding))

    def write_json(self, rel: str, obj: Any, *, indent: int = 2) -> None:
        self.write_text(rel, json.dumps(obj, ensure_ascii=False, indent=indent) + "\n")

    def delete(self, rel: str) -> None:
        p = self._abs(rel)
        if p.is_dir():
            # mirror object-store semantics: directories aren't real; only remove if empty
            p.rmdir()
        else:
            p.unlink(missing_ok=True)

    def list(self, prefix: str = "", recursive: bool = True) -> Iterable[str]:
        root = self._abs(prefix or ".")
        if not root.exists():
            return []
        if root.is_file():
            return [_norm_rel(prefix)]
        # directory walk
        out = []
        if recursive:
            for p in root.rglob("*"):
                if p.is_file():
                    out.append(str(p.relative_to(Path(self.mount_path))).replace("\\", "/"))
        else:
            for p in root.iterdir():
                if p.is_file():
                    out.append(str(p.relative_to(Path(self.mount_path))).replace("\\", "/"))
        return out

# Optional: S3 API backend (when no FUSE mount is available)
# Requires boto3 (pip install boto3). This is helpful in local dev where FUSE mounts
# may not work (e.g. wrangler dev).
try:
    import boto3  # type: ignore
except Exception:  # pragma: no cover
    boto3 = None

@dataclass
class R2S3:
    """S3-compatible R2 helper using boto3.

    Env vars expected:
      - R2_ACCOUNT_ID
      - R2_BUCKET_NAME
      - AWS_ACCESS_KEY_ID
      - AWS_SECRET_ACCESS_KEY
    """
    account_id: str = os.getenv("R2_ACCOUNT_ID", "")
    bucket: str = os.getenv("R2_BUCKET_NAME", "")
    access_key_id: str = os.getenv("AWS_ACCESS_KEY_ID", "")
    secret_access_key: str = os.getenv("AWS_SECRET_ACCESS_KEY", "")

    def _client(self):
        if boto3 is None:
            raise RuntimeError("boto3 is not installed. Add `boto3` to your sandbox image or requirements.")
        if not (self.account_id and self.bucket and self.access_key_id and self.secret_access_key):
            raise RuntimeError("Missing R2 env vars. Need R2_ACCOUNT_ID, R2_BUCKET_NAME, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY.")
        endpoint = f"https://{self.account_id}.r2.cloudflarestorage.com"
        return boto3.client(
            "s3",
            endpoint_url=endpoint,
            aws_access_key_id=self.access_key_id,
            aws_secret_access_key=self.secret_access_key,
            region_name="auto",
        )

    def put_bytes(self, key: str, data: BytesLike, content_type: Optional[str] = None) -> None:
        c = self._client()
        args = {"Bucket": self.bucket, "Key": _norm_rel(key), "Body": bytes(data)}
        if content_type:
            args["ContentType"] = content_type
        c.put_object(**args)

    def get_bytes(self, key: str) -> bytes:
        c = self._client()
        obj = c.get_object(Bucket=self.bucket, Key=_norm_rel(key))
        return obj["Body"].read()

    def list(self, prefix: str = "") -> list[str]:
        c = self._client()
        prefix = _norm_rel(prefix) if prefix else ""
        out: list[str] = []
        token = None
        while True:
            kwargs = {"Bucket": self.bucket, "Prefix": prefix}
            if token:
                kwargs["ContinuationToken"] = token
            resp = c.list_objects_v2(**kwargs)
            for it in resp.get("Contents", []):
                out.append(it["Key"])
            if not resp.get("IsTruncated"):
                break
            token = resp.get("NextContinuationToken")
        return out

    def delete(self, key: str) -> None:
        c = self._client()
        c.delete_object(Bucket=self.bucket, Key=_norm_rel(key))

def get_r2() -> Union[R2FS, R2S3]:
    """Prefer filesystem (FUSE mount) if present, otherwise S3 API."""
    mp = os.getenv("R2_MOUNT_PATH", "/r2")
    if Path(mp).exists():
        return R2FS(mount_path=mp)
    return R2S3()
