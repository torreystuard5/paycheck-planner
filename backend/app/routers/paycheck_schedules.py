import calendar
from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.paycheck_schedule import PaycheckSchedule
from app.models.user import User
from app.schemas.paycheck_schedule import (
    PaycheckScheduleCreate,
    PaycheckScheduleOut,
    PaycheckScheduleUpdate,
    UpcomingPaycheckDate,
)
from app.utils.security import get_current_user

router = APIRouter(prefix="/paycheck-schedules", tags=["Paycheck Schedules"])


# ── Helpers ───────────────────────────────────────────────────────


def _next_weekday(start: date, weekday: int) -> date:
    """Return the next date on or after `start` that falls on `weekday` (0=Mon..6=Sun)."""
    days_ahead = weekday - start.weekday()
    if days_ahead < 0:
        days_ahead += 7
    return start + timedelta(days=days_ahead)


def _clamp_day(year: int, month: int, day: int) -> date:
    """Clamp a day-of-month to the actual last day of that month."""
    max_day = calendar.monthrange(year, month)[1]
    return date(year, month, min(day, max_day))


def _get_upcoming_dates(schedule: PaycheckSchedule, ref_date: date, count: int) -> list[date]:
    """Calculate the next `count` paycheck dates for a schedule from `ref_date`."""
    dates: list[date] = []

    if schedule.frequency == "weekly":
        dow = schedule.day_of_week if schedule.day_of_week is not None else 4  # default Friday
        d = _next_weekday(ref_date, dow)
        while len(dates) < count:
            dates.append(d)
            d += timedelta(days=7)

    elif schedule.frequency == "biweekly":
        dow = schedule.day_of_week if schedule.day_of_week is not None else 4
        anchor = schedule.anchor_date if schedule.anchor_date else ref_date
        # Find the first biweekly occurrence on or after ref_date
        d = _next_weekday(anchor, dow)
        if d < ref_date:
            # Jump forward in 14-day increments
            weeks_diff = (ref_date - d).days // 14
            d += timedelta(days=14 * weeks_diff)
            if d < ref_date:
                d += timedelta(days=14)
        while len(dates) < count:
            dates.append(d)
            d += timedelta(days=14)

    elif schedule.frequency == "semi_monthly":
        d1 = schedule.day1 if schedule.day1 is not None else 1
        d2 = schedule.day2 if schedule.day2 is not None else 15
        if d1 > d2:
            d1, d2 = d2, d1
        year, month = ref_date.year, ref_date.month
        while len(dates) < count:
            candidate1 = _clamp_day(year, month, d1)
            candidate2 = _clamp_day(year, month, d2)
            if candidate1 >= ref_date:
                dates.append(candidate1)
            if len(dates) < count and candidate2 >= ref_date:
                dates.append(candidate2)
            # Advance to next month
            if month == 12:
                year += 1
                month = 1
            else:
                month += 1

    elif schedule.frequency == "monthly":
        d1 = schedule.day1 if schedule.day1 is not None else 1
        year, month = ref_date.year, ref_date.month
        while len(dates) < count:
            candidate = _clamp_day(year, month, d1)
            if candidate >= ref_date:
                dates.append(candidate)
            if month == 12:
                year += 1
                month = 1
            else:
                month += 1

    return dates[:count]


# ── Upcoming endpoint (BEFORE /{id} routes to avoid route conflict) ──


@router.get("/upcoming", response_model=list[UpcomingPaycheckDate])
async def get_upcoming_paycheck_dates(
    count: int = Query(default=10, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(PaycheckSchedule).where(PaycheckSchedule.user_id == current_user.id)
    )
    schedules = result.scalars().all()

    if not schedules:
        return []

    today = date.today()
    all_dates: list[UpcomingPaycheckDate] = []

    for sched in schedules:
        upcoming = _get_upcoming_dates(sched, today, count)
        for d in upcoming:
            all_dates.append(
                UpcomingPaycheckDate(
                    date=d,
                    schedule_id=sched.id,
                    income_source_name=sched.income_source_name,
                )
            )

    # Sort by date and return the first `count` entries
    all_dates.sort(key=lambda x: x.date)
    return all_dates[:count]


# ── Standard CRUD ─────────────────────────────────────────────────


@router.get("", response_model=list[PaycheckScheduleOut])
async def list_paycheck_schedules(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(PaycheckSchedule).where(PaycheckSchedule.user_id == current_user.id)
    )
    return result.scalars().all()


@router.post("", response_model=PaycheckScheduleOut, status_code=status.HTTP_201_CREATED)
async def create_paycheck_schedule(
    data: PaycheckScheduleCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    schedule = PaycheckSchedule(
        user_id=current_user.id,
        frequency=data.frequency,
        day_of_week=data.day_of_week,
        anchor_date=data.anchor_date,
        day1=data.day1,
        day2=data.day2,
        income_source_name=data.income_source_name,
    )
    db.add(schedule)
    await db.flush()
    await db.refresh(schedule)
    return schedule


@router.put("/{schedule_id}", response_model=PaycheckScheduleOut)
async def update_paycheck_schedule(
    schedule_id: int,
    data: PaycheckScheduleUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(PaycheckSchedule).where(
            PaycheckSchedule.id == schedule_id,
            PaycheckSchedule.user_id == current_user.id,
        )
    )
    schedule = result.scalar_one_or_none()
    if not schedule:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Paycheck schedule not found")

    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(schedule, field, value)

    await db.flush()
    await db.refresh(schedule)
    return schedule


@router.delete("/{schedule_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_paycheck_schedule(
    schedule_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(PaycheckSchedule).where(
            PaycheckSchedule.id == schedule_id,
            PaycheckSchedule.user_id == current_user.id,
        )
    )
    schedule = result.scalar_one_or_none()
    if not schedule:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Paycheck schedule not found")

    await db.delete(schedule)
    await db.flush()
