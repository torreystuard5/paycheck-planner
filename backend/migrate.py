from alembic import command
from alembic.config import Config
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
ALEMBIC_CFG_PATH = BASE_DIR / "alembic.ini"

def run_migrations():
    import logging

    logging.basicConfig(level=logging.INFO)
    log = logging.getLogger("migrate")
    cfg = Config(str(ALEMBIC_CFG_PATH))
    log.info("Running Alembic upgrade to head...")
    command.upgrade(cfg, "head")
    log.info("Alembic upgrade complete.")


if __name__ == "__main__":
    run_migrations()
