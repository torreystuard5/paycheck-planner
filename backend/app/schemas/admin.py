from datetime import date

from pydantic import BaseModel


class SignupDay(BaseModel):
    date: date
    count: int


class AdminStatsResponse(BaseModel):
    total_users: int
    total_active_users_30d: int
    total_pro_subscribers: int
    total_free_users: int
    total_households: int
    total_support_tickets: int
    signups_last_7_days: list[SignupDay]
