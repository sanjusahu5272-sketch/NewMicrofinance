"""Read-only integrity audit for NMFA financial records.

This command never edits, repairs, deletes, or posts transactions. Review every
reported finding before applying a separately approved correction.
Usage: python manage.py audit_financial_integrity [--strict]
"""
from collections import defaultdict
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db.models import Sum

from finance.models import Disbursement, Installment, JournalEntry, Loan, Payment

ZERO = Decimal("0.00")


class Command(BaseCommand):
    help = "Read-only checks for common loan, payment, disbursement, and ledger inconsistencies."

    def add_arguments(self, parser):
        parser.add_argument("--strict", action="store_true", help="Exit with status 1 when findings exist.")

    def handle(self, *args, **options):
        findings = []
        checked = defaultdict(int)

        for payment in Payment.objects.all().only(
            "id", "receipt_no", "amount", "status", "is_reversed", "reversed_at", "idempotency_key"
        ).iterator():
            checked["payments"] += 1
            if payment.amount <= ZERO:
                findings.append(f"Payment #{payment.pk} ({payment.receipt_no}): amount is not positive.")
            if payment.is_reversed and not payment.reversed_at:
                findings.append(f"Payment #{payment.pk} ({payment.receipt_no}): marked reversed without reversed_at.")
            if payment.status in {"refunded", "reversed"} and not payment.is_reversed:
                findings.append(f"Payment #{payment.pk} ({payment.receipt_no}): refunded/reversed status but is_reversed is false.")

        for loan in Loan.objects.all().only("id", "status", "principal", "total_payable").iterator():
            checked["loans"] += 1
            disbursement = Disbursement.objects.filter(loan_id=loan.pk).first()
            if loan.status == "disbursed" and (disbursement is None or disbursement.status != "success"):
                findings.append(f"Loan #{loan.pk}: status is disbursed but no successful disbursement record exists.")
            if disbursement and disbursement.amount <= ZERO:
                findings.append(f"Loan #{loan.pk}: disbursement amount is not positive.")
            installment_totals = Installment.objects.filter(loan_id=loan.pk).aggregate(
                principal=Sum("principal_due"), interest=Sum("interest_due")
            )
            scheduled = (installment_totals["principal"] or ZERO) + (installment_totals["interest"] or ZERO)
            if loan.status in ("approved", "disbursed", "closed") and scheduled and abs(scheduled - loan.total_payable) > Decimal("0.02"):
                findings.append(
                    f"Loan #{loan.pk}: installment principal+interest total {scheduled:.2f} differs from total_payable {loan.total_payable:.2f}."
                )

        # Journal entries are legacy rows and not all references necessarily identify
        # a complete transaction. Only flag references whose rows are unbalanced.
        grouped = defaultdict(lambda: {"debit": ZERO, "credit": ZERO, "count": 0})
        for row in JournalEntry.objects.all().only("reference", "debit", "credit").iterator():
            checked["journal_entries"] += 1
            if row.debit < ZERO or row.credit < ZERO:
                findings.append(f"Journal reference '{row.reference}': negative debit/credit amount exists.")
            if row.debit > ZERO and row.credit > ZERO:
                findings.append(f"Journal reference '{row.reference}': one row has both debit and credit.")
            if row.reference:
                grouped[row.reference]["debit"] += row.debit
                grouped[row.reference]["credit"] += row.credit
                grouped[row.reference]["count"] += 1
        for reference, totals in grouped.items():
            # Multi-row references are expected to balance when used as a transaction.
            if totals["count"] >= 2 and abs(totals["debit"] - totals["credit"]) > Decimal("0.01"):
                findings.append(
                    f"Journal reference '{reference}': debits {totals['debit']:.2f} != credits {totals['credit']:.2f}."
                )

        self.stdout.write(self.style.SUCCESS("NMFA financial integrity audit (READ ONLY)"))
        for label, count in checked.items():
            self.stdout.write(f"Checked {label}: {count}")
        if findings:
            self.stdout.write(self.style.WARNING(f"Findings: {len(findings)} (no records changed)"))
            for finding in findings:
                self.stdout.write(f"- {finding}")
            if options["strict"]:
                from django.core.management.base import CommandError
                raise CommandError(f"Audit found {len(findings)} finding(s); no records changed.")
        else:
            self.stdout.write(self.style.SUCCESS("No issues detected by these checks."))
        self.stdout.write("Audit is advisory; it does not prove that all accounting or legal requirements are met.")
