from datetime import datetime

from pydantic import BaseModel


class PasswordCreate(BaseModel):
    site_name: str | None = None
    username: str | None = None
    password: str | None = None
    url: str | None = None
    notes: str | None = None


class PasswordUpdate(BaseModel):
    site_name: str | None = None
    username: str | None = None
    password: str | None = None
    url: str | None = None
    notes: str | None = None


class PasswordListItem(BaseModel):
    id: int
    site_name: str | None
    username: str | None
    url: str | None
    created_at: datetime
    updated_at: datetime | None

    model_config = {"from_attributes": True}


class PasswordDetail(BaseModel):
    id: int
    site_name: str | None
    username: str | None
    password: str | None
    url: str | None
    notes: str | None
    created_at: datetime
    updated_at: datetime | None

    model_config = {"from_attributes": True}
