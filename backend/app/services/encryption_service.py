import logging
import os

from cryptography.fernet import Fernet

logger = logging.getLogger(__name__)

_key = os.environ.get("NOTES_ENCRYPTION_KEY")
if not _key:
    logger.warning(
        "NOTES_ENCRYPTION_KEY not set — using insecure default key. "
        "Set this env var in production!"
    )
    _key = Fernet.generate_key().decode()

_fernet = Fernet(_key if isinstance(_key, bytes) else _key.encode())


def encrypt(plaintext: str | None) -> str | None:
    if plaintext is None:
        return None
    return _fernet.encrypt(plaintext.encode()).decode()


def decrypt(ciphertext: str | None) -> str | None:
    if ciphertext is None:
        return None
    return _fernet.decrypt(ciphertext.encode()).decode()
