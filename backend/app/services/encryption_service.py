from cryptography.fernet import Fernet

from app.config import settings


def _load_cipher() -> Fernet:
    key = settings.NOTES_ENCRYPTION_KEY
    if not key:
        raise RuntimeError("NOTES_ENCRYPTION_KEY must be configured with a persistent Fernet key")
    try:
        return Fernet(key.encode())
    except (ValueError, TypeError) as exc:
        raise RuntimeError("NOTES_ENCRYPTION_KEY is invalid; restore the existing encryption key") from exc


_fernet = _load_cipher()


def encrypt(plaintext: str | None) -> str | None:
    if plaintext is None:
        return None
    return _fernet.encrypt(plaintext.encode()).decode()


def decrypt(ciphertext: str | None) -> str | None:
    if ciphertext is None:
        return None
    return _fernet.decrypt(ciphertext.encode()).decode()
