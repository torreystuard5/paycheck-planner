from datetime import date

from app.utils.due_dates import next_monthly_due_date


def test_next_monthly_due_date_later_this_month():
    result = next_monthly_due_date(15, today=date(2026, 6, 10))
    assert result == date(2026, 6, 15)


def test_next_monthly_due_date_rolls_to_next_month():
    result = next_monthly_due_date(5, today=date(2026, 6, 10))
    assert result == date(2026, 7, 5)


def test_next_monthly_due_date_none_without_due_day():
    assert next_monthly_due_date(None) is None
