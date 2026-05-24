"""Run Alembic migrations and **fail loudly** on error.

Render's preDeployCommand runs this script.  If it exits non-zero,
Render aborts the deploy so the app never boots with a stale schema.
"""

import logging
import sys
import traceback

from alembic import command
from alembic.config import Config
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
ALEMBIC_CFG_PATH = BASE_DIR / "alembic.ini"

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("migrate")


def run_migrations():
    cfg = Config(str(ALEMBIC_CFG_PATH))
    log.info("Running Alembic upgrade to head...")
    try:
        command.upgrade(cfg, "head")
    except Exception as exc:
        log.error("Alembic migration FAILED — aborting deploy")
        traceback.print_exc()
        sys.exit(1)
    log.info("Alembic upgrade complete.")


if __name__ == "__main__":
    run_migrations()
