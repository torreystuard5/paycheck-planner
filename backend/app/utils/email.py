def normalize_email(email: str | None) -> str | None:
    if email is None:
        return None
    return email.strip().lower()
