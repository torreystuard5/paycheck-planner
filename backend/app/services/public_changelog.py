"""Parse generated CHANGELOG.md and merge with baseline history for in-app updates."""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from datetime import date, datetime, timezone
from pathlib import Path

_BACKEND_ROOT = Path(__file__).resolve().parent.parent.parent
CHANGELOG_PATH = _BACKEND_ROOT / "CHANGELOG.md"
HISTORY_PATH = _BACKEND_ROOT / "data" / "changelog_history.json"

_GROUP_TO_TYPE = {
    "features": "new_feature",
    "bug fixes": "fix",
}

_LINE_RE = re.compile(
    r"^- (\d{4}-\d{2}-\d{2}) — (?:\*\*([^*]+)\*\*: )?(.+)$"
)


@dataclass(frozen=True)
class ChangelogEntry:
    entry_date: date
    description: str
    entry_type: str
    source: str  # "history" | "git"


def _normalize_type(group_title: str | None, raw: str | None = None) -> str:
    if raw and raw in ("new_feature", "update", "fix"):
        return raw
    if group_title:
        key = group_title.strip().lower()
        if key in _GROUP_TO_TYPE:
            return _GROUP_TO_TYPE[key]
    return "update"


def load_history_entries() -> list[ChangelogEntry]:
    if not HISTORY_PATH.is_file():
        return []
    raw = json.loads(HISTORY_PATH.read_text(encoding="utf-8"))
    out: list[ChangelogEntry] = []
    for row in raw:
        out.append(
            ChangelogEntry(
                entry_date=date.fromisoformat(row["date"]),
                description=row["description"].strip(),
                entry_type=_normalize_type(None, row.get("type")),
                source="history",
            )
        )
    return out


def parse_changelog_markdown(path: Path | None = None) -> list[ChangelogEntry]:
    """Parse git-cliff CHANGELOG.md bullets (YYYY-MM-DD — **scope**: text)."""
    path = path or CHANGELOG_PATH
    if not path.is_file():
        return []

    text = path.read_text(encoding="utf-8")
    current_group: str | None = None
    entries: list[ChangelogEntry] = []

    for line in text.splitlines():
        stripped = line.strip()
        if stripped.startswith("### "):
            current_group = stripped.removeprefix("### ").strip()
            continue
        match = _LINE_RE.match(stripped)
        if not match:
            continue
        day = date.fromisoformat(match.group(1))
        scope = (match.group(2) or "").strip()
        body = match.group(3).strip()
        if scope:
            label = scope.replace("-", " ").title()
            description = f"{label}: {body}"
        else:
            description = body
        entries.append(
            ChangelogEntry(
                entry_date=day,
                description=description,
                entry_type=_normalize_type(current_group),
                source="git",
            )
        )
    return entries


def merge_public_entries() -> list[ChangelogEntry]:
    """History first, then git entries; dedupe by (date, normalized description)."""
    seen: set[tuple[str, str]] = set()
    merged: list[ChangelogEntry] = []
    for entry in load_history_entries() + parse_changelog_markdown():
        key = (entry.entry_date.isoformat(), entry.description.casefold())
        if key in seen:
            continue
        seen.add(key)
        merged.append(entry)
    merged.sort(key=lambda e: (e.entry_date, e.description), reverse=True)
    return merged


def entry_created_at(entry: ChangelogEntry) -> datetime:
    """Stable timestamp for whats-new ordering (noon UTC on entry date)."""
    return datetime(
        entry.entry_date.year,
        entry.entry_date.month,
        entry.entry_date.day,
        12,
        0,
        0,
        tzinfo=timezone.utc,
    )
