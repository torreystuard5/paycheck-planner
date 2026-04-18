from alembic import command
from alembic.config import Config
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
ALEMBIC_CFG_PATH = BASE_DIR / "alembic.ini"

def run_migrations():
    cfg = Config(str(ALEMBIC_CFG_PATH))
    command.upgrade(cfg, "head")

if __name__ == "__main__":
    run_migrations()
