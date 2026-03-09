"""Shared FastAPI dependencies."""
from fastapi import Header


def get_session_id(x_session_id: str | None = Header(None, alias="X-Session-Id")) -> str:
    """Read session/device id from X-Session-Id header. Defaults to 'legacy' for backward compat."""
    if not x_session_id or not (sid := x_session_id.strip()):
        return "legacy"
    return sid
