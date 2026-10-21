from io import StringIO
from decimal import Decimal

from django.core.management import call_command
from django.test import TestCase
from finance.models import Branch, Member, Payment, JournalEntry


class FinancialIntegrityCommandTests(TestCase):
    def test_empty_database_audit_is_read_only_and_reports_clean(self):
        output = StringIO()
        call_command("audit_financial_integrity", stdout=output)
        self.assertIn("READ ONLY", output.getvalue())
        self.assertIn("No issues detected", output.getvalue())

    def test_nonpositive_payment_is_reported_without_mutating_record(self):
        branch = Branch.objects.create(name="Audit Branch", code="AUDIT-BR")
        member = Member.objects.create(branch=branch, name="Audit Member", member_no="AUDIT-001", phone="0000000000")
        payment = Payment.objects.create(member=member, receipt_no="AUDIT-R-001", amount=Decimal("0.00"), method="cash")
        output = StringIO()
        call_command("audit_financial_integrity", stdout=output)
        self.assertIn(f"Payment #{payment.pk}", output.getvalue())
        payment.refresh_from_db()
        self.assertEqual(payment.amount, Decimal("0.00"))

    def test_unbalanced_journal_reference_is_reported(self):
        JournalEntry.objects.create(entry_type="adjustment", account="Cash", debit=Decimal("100.00"), credit=Decimal("0.00"), reference="AUDIT-UNBALANCED")
        JournalEntry.objects.create(entry_type="adjustment", account="Income", debit=Decimal("0.00"), credit=Decimal("90.00"), reference="AUDIT-UNBALANCED")
        output = StringIO()
        call_command("audit_financial_integrity", stdout=output)
        self.assertIn("AUDIT-UNBALANCED", output.getvalue())
        self.assertIn("debits 100.00 != credits 90.00", output.getvalue())
