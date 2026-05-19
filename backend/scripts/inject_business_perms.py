import re
from pathlib import Path

p = Path(__file__).resolve().parents[1] / "app" / "routers" / "business.py"
text = p.read_text(encoding="utf-8")

perms = [
    ("async def create_sale", '    ctx.require("manage_sales")\n'),
    ("async def update_sale", '    ctx.require("manage_sales")\n'),
    ("async def delete_sale", '    ctx.require("manage_sales")\n'),
    ("async def update_business_settings", "    ctx.require_owner()\n"),
    ("async def create_customer", '    ctx.require("manage_sales")\n'),
    ("async def update_customer", '    ctx.require("manage_sales")\n'),
    ("async def delete_customer", '    ctx.require("manage_sales")\n'),
    ("async def create_deduction", '    ctx.require("manage_deductions")\n'),
    ("async def update_deduction", '    ctx.require("manage_deductions")\n'),
    ("async def delete_deduction", '    ctx.require("manage_deductions")\n'),
    ("async def create_staff", '    ctx.require("manage_staff_pay")\n'),
    ("async def update_staff", '    ctx.require("manage_staff_pay")\n'),
    ("async def delete_staff", '    ctx.require("manage_staff_pay")\n'),
    ("async def create_pay_run", '    ctx.require("manage_staff_pay")\n'),
    ("async def update_pay_run", '    ctx.require("manage_staff_pay")\n'),
    ("async def delete_pay_run", '    ctx.require("manage_staff_pay")\n'),
    ("async def create_fund", '    ctx.require("manage_funds")\n'),
    ("async def update_fund", '    ctx.require("manage_funds")\n'),
    ("async def delete_fund", '    ctx.require("manage_funds")\n'),
    ("async def create_fund_transaction", '    ctx.require("manage_funds")\n'),
    ("async def delete_fund_transaction", '    ctx.require("manage_funds")\n'),
]

for fn, line in perms:
    if fn not in text:
        print("missing", fn)
        continue
    idx = text.find(fn)
    end = text.find("):", idx) + 2
    nxt = text[end : end + 200]
    if "ctx.require" in nxt.split("\n")[0:4]:
        print("skip", fn)
        continue
    text = text[:end] + "\n" + line + text[end:]
    print("added", fn)

p.write_text(text, encoding="utf-8")
