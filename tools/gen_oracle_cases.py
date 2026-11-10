#!/usr/bin/env python3
"""Generate Python-oracle settlement expectations for the PHP parity test."""
import datetime, json, os, sys
from decimal import Decimal as D, ROUND_HALF_UP, getcontext

getcontext().prec = 50
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "oracle"))
sys.path.insert(0, os.path.join(HERE, "..", "oracle"))
from settlement_oracle import build_schedule, money, q


def simple_case(name, principal, rate, n, start, paid, settle, charge_pct, gst_pct="18.00"):
    sched, _ = build_schedule(principal, rate, n, datetime.date.fromisoformat(start))
    settle_dt = datetime.date.fromisoformat(settle)
    unpaid = sum(D(r["principal_component"]) for r in sched[paid:])
    accrued = sum(
        D(r["interest_component"]) for r in sched[paid:]
        if datetime.date.fromisoformat(r["due_date"]) <= settle_dt
    )
    # If nothing has been paid, interest still accrues from DISBURSEMENT.
    # Charging zero here was the original bug: a member who prepays 45 days
    # after drawdown owes 45 days of interest whether or not an EMI was due.
    if paid > 0:
        last = datetime.date.fromisoformat(sched[paid - 1]["due_date"])
    else:
        last = datetime.date.fromisoformat(start)
    days = max(0, (settle_dt - last).days)
    daily = D(rate) / D(100) / D(365)
    tail = q(unpaid * daily * D(days)) if days > 0 else D("0.00")
    interest_due = accrued + tail
    charge = q(unpaid * D(charge_pct) / D(100))
    gst = q(charge * D(gst_pct) / D(100))
    total = q(unpaid + interest_due + charge + gst)
    return {
        "name": name,
        "plan_amount": money(D(principal)),
        "interest_rate_pa": rate,
        "tenure_emis": n,
        "start_date": start,
        "paid_emis": paid,
        "settlement_date": settle,
        "charge_pct": charge_pct,
        "expected": {
            "principal_outstanding": money(unpaid),
            "broken_period_days": str(days),
            "broken_period_interest": money(tail),
            "accrued_scheduled_interest": money(accrued),
            "interest_due": money(interest_due),
            "foreclosure_charge": money(charge),
            "gst_on_charge": money(gst),
            "total_payable": money(total),
        },
    }


SPECS = [
    ("base-18pct-12m-3paid",        "100000", "18.00", 12, "2026-01-01",  3, "2026-05-10", "3.00"),
    ("high-24pct-24m-6paid",        "250000", "24.00", 24, "2026-01-01",  6, "2026-09-15", "2.00"),
    ("low-12pct-6m-1paid",           "25000", "12.00",  6, "2026-01-01",  1, "2026-03-20", "4.00"),
    ("zero-rate-12m-4paid",          "60000",  "0.00", 12, "2026-01-01",  4, "2026-06-05", "1.00"),
    ("small-5000-3m-0paid",           "5000", "20.00",  3, "2026-01-01",  0, "2026-02-15", "3.00"),
    ("big-10L-36m-12paid",         "1000000", "16.00", 36, "2026-01-01", 12, "2027-06-20", "1.50"),
    ("high36-12m-11paid",           "150000", "36.00", 12, "2026-01-01", 11, "2026-12-20", "5.00"),
    ("last-emi-settle",              "80000", "22.00",  9, "2026-01-01",  8, "2026-09-25", "3.00"),
    ("day0-no-payments",            "120000", "18.00", 12, "2026-01-01",  0, "2026-01-01", "3.00"),
    ("mid-cycle-2paid",              "75000", "21.00", 18, "2026-01-01",  2, "2026-04-11", "2.50"),
]

cases = [simple_case(*s) for s in SPECS]

out = os.path.join(HERE, "..", "tests", "fixtures", "settlement_oracle_cases.json")
os.makedirs(os.path.dirname(out), exist_ok=True)
with open(out, "w") as f:
    json.dump({"generated_by": "tools/gen_oracle_cases.py", "cases": cases}, f, indent=2)

print(f"wrote {len(cases)} oracle cases")
for c in cases:
    e = c["expected"]
    print(f"  {c['name']:<26} total ₹{e['total_payable']:>13}  (principal {e['principal_outstanding']})")
