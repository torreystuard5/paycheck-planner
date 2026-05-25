from datetime import date
from pathlib import Path

from app.services.public_changelog import (
    ChangelogEntry,
    merge_public_entries,
    parse_changelog_markdown,
)


SAMPLE = """# Changelog

## [Unreleased]

### Features

- 2026-05-20 — **household**: Add shopping list tab

### Bug Fixes

- 2026-05-19 — **auth**: Fix token refresh
- 2026-05-18 — Repair login without scope
"""


def test_parse_changelog_markdown(tmp_path):
    path = tmp_path / "CHANGELOG.md"
    path.write_text(SAMPLE, encoding="utf-8")
    entries = parse_changelog_markdown(path)
    assert len(entries) == 3
    assert entries[0].entry_type == "new_feature"
    assert entries[0].entry_date == date(2026, 5, 20)
    assert "Household" in entries[0].description
    assert entries[1].entry_type == "fix"


def test_merge_dedupes_history_and_git(monkeypatch, tmp_path):
    history = tmp_path / "history.json"
    history.write_text(
        '[{"date": "2026-03-25", "description": "Mobile login fixed.", "type": "fix"}]',
        encoding="utf-8",
    )
    changelog = tmp_path / "CHANGELOG.md"
    changelog.write_text(SAMPLE, encoding="utf-8")

    import app.services.public_changelog as mod

    monkeypatch.setattr(mod, "HISTORY_PATH", history)
    monkeypatch.setattr(mod, "CHANGELOG_PATH", changelog)

    merged = merge_public_entries()
    descriptions = {e.description for e in merged}
    assert any("Mobile login" in d for d in descriptions)
    assert any("shopping list" in d.lower() for d in descriptions)
