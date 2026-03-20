from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User
from app.services.reminder_service import check_and_send_reminders
from app.utils.security import get_current_user

router = APIRouter(prefix="/reminders", tags=["Reminders"])


class ReminderCheckResponse(BaseModel):
    bills_reminded: int
    debts_reminded: int
    errors: list[str]


@router.post("/check", response_model=ReminderCheckResponse)
async def check_reminders(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await check_and_send_reminders(db, user_id=current_user.id)
    return result
