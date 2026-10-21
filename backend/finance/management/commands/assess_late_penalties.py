from decimal import Decimal, ROUND_HALF_UP
from django.core.management.base import BaseCommand
from django.db import transaction
from django.db.models import Sum
from django.utils import timezone
from finance.models import Installment, JournalEntry, PenaltyAssessment


class Command(BaseCommand):
    help = "Assess late penalties from a linked scheme or the legacy fixed-per-installment loan-plan rule. Safe to rerun daily."

    def handle(self, *args, **options):
        today = timezone.localdate()
        assessed = 0
        with transaction.atomic():
            rows = (Installment.objects.select_for_update()
                    .select_related("loan__product__penalty_scheme")
                    .filter(loan__status="disbursed", due_date__lt=today)
                    .order_by("pk"))
            for inst in rows.iterator():
                product = inst.loan.product
                days_overdue = (today - inst.due_date).days
                unpaid_principal = max(Decimal("0.00"), inst.principal_due - inst.principal_paid)
                unpaid_interest = max(Decimal("0.00"), inst.interest_due - inst.interest_paid)
                overdue_base = (unpaid_principal + unpaid_interest).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
                if overdue_base <= 0 or inst.status == "paid":
                    continue

                scheme = product.penalty_scheme if product.penalty_scheme_id else None
                if scheme is None:
                    # Backwards-compatible rule: fixed LoanProduct.late_penalty once per installment.
                    if inst.penalty_due > 0 or days_overdue <= product.grace_days or product.late_penalty <= 0:
                        continue
                    charge = Decimal(product.late_penalty).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
                    key = f"LEGACY-INSTALLMENT-{inst.pk}-ONCE"
                    if PenaltyAssessment.objects.filter(assessment_key=key).exists():
                        continue
                    source = "legacy"
                else:
                    # Scheme settings are bound to the plan. Old charges are never rewritten;
                    # recurring schemes catch up only the positive difference to the cumulative target.
                    if not scheme.active or days_overdue <= scheme.grace_period_days or overdue_base < scheme.minimum_due_amount:
                        continue
                    try:
                        target = scheme.calculate_penalty(overdue_base, days_overdue)
                    except (ValueError, ArithmeticError) as exc:
                        raise ValueError(f"Cannot calculate penalty for installment {inst.pk}: {exc}") from exc
                    if scheme.penalty_mode == "daily" and scheme.recurring:
                        key = f"SCHEME-{scheme.pk}-INSTALLMENT-{inst.pk}-DAY-{today:%Y%m%d}"
                        if PenaltyAssessment.objects.filter(assessment_key=key).exists():
                            continue
                        prior = (PenaltyAssessment.objects.filter(installment=inst, scheme=scheme).aggregate(total=Sum('amount'))['total'] or Decimal('0.00'))
                        charge = max(Decimal("0.00"), target - prior).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
                    else:
                        key = f"SCHEME-{scheme.pk}-INSTALLMENT-{inst.pk}-ONCE"
                        if PenaltyAssessment.objects.filter(assessment_key=key).exists():
                            continue
                        charge = target
                    if charge <= 0:
                        continue
                    source = "scheme"
                if charge <= 0:
                    continue

                try:
                    with transaction.atomic():
                        assessment = PenaltyAssessment.objects.create(
                            installment=inst, scheme=scheme, assessment_date=today,
                            assessment_key=key, source=source, overdue_days=days_overdue,
                            overdue_amount=overdue_base, amount=charge,
                        )
                except Exception as exc:
                    # A concurrent command may have inserted this unique key after our read.
                    from django.db import IntegrityError
                    if isinstance(exc, IntegrityError):
                        continue
                    raise
                inst.penalty_due = (inst.penalty_due + charge).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
                inst.save(update_fields=["penalty_due", "updated_at"])
                reference = f"PENALTY-INSTALLMENT-{inst.pk}" if source == "legacy" else f"PENALTY-ASSESSMENT-{assessment.pk}"
                # Each charge has exactly two balanced journal lines; the assessment key is the idempotency source.
                JournalEntry.objects.bulk_create([
                    JournalEntry(date=today, entry_type="adjustment", account="Penalty Receivable", debit=charge, credit=Decimal("0"), reference=reference, note=f"Late penalty assessment {assessment.pk} for installment {inst.pk}"),
                    JournalEntry(date=today, entry_type="adjustment", account="Penalty Income", debit=Decimal("0"), credit=charge, reference=reference, note=f"Late penalty assessment {assessment.pk} for installment {inst.pk}"),
                ])
                assessed += 1
        self.stdout.write(self.style.SUCCESS(f"Assessed {assessed} late penalty charge(s)."))
