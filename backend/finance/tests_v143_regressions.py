from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from .models import (
    Branch, Member, LoanProduct, Loan, LoanApplication, Installment, Payment,
    StaffProfile, CustomRole, CapitalEntry, Expense, KycDocument, JournalEntry,
)


class V143RegressionTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.admin = User.objects.create_user(username='v143-admin', password='test-password-123', is_staff=True)
        self.client = APIClient()
        self.client.force_authenticate(self.admin)
        self.branch_a = Branch.objects.create(name='V143 Branch A', code='V143-A')
        self.branch_b = Branch.objects.create(name='V143 Branch B', code='V143-B')
        self.member_a = Member.objects.create(branch=self.branch_a, member_no='V143-MA', name='Member A', phone='9000000101')
        self.member_b = Member.objects.create(branch=self.branch_b, member_no='V143-MB', name='Member B', phone='9000000102')
        for member, prefix in ((self.member_a, 'a'), (self.member_b, 'b')):
            KycDocument.objects.create(member=member, document_type='identity', file=f'private/v143-{prefix}-id.pdf', original_name=f'v143-{prefix}-id.pdf', verified=True)
            KycDocument.objects.create(member=member, document_type='address', file=f'private/v143-{prefix}-address.pdf', original_name=f'v143-{prefix}-address.pdf', verified=True)
        self.product = LoanProduct.objects.create(
            name='V143 Product', code='V143-P', interest_rate=Decimal('12.000'),
            interest_method='flat', frequency='monthly', tenure=6,
        )

    def _branch_user(self, username, permissions=None, custom_role=None):
        user = get_user_model().objects.create_user(username=username, password='test-password-123')
        StaffProfile.objects.create(
            user=user, role='manager', branch=self.branch_a,
            permissions=permissions or {}, custom_role=custom_role,
        )
        return user

    def test_custom_role_permissions_are_effective_for_api_access(self):
        role = CustomRole.objects.create(
            name='V143 Customer Viewer', code='v143-customer-viewer',
            permissions={'view_customers': True}, active=True,
        )
        user = self._branch_user('v143-custom-role-user', custom_role=role)
        client = APIClient()
        client.force_authenticate(user)
        response = client.get('/api/members/')
        self.assertEqual(response.status_code, 200, response.data)
        rows = response.data.get('results', response.data) if isinstance(response.data, dict) else response.data
        self.assertEqual([row['id'] for row in rows], [self.member_a.pk])

    def test_custom_role_inactive_grants_are_not_effective(self):
        role = CustomRole.objects.create(
            name='V143 Inactive Role', code='v143-inactive-role',
            permissions={'view_customers': True}, active=False,
        )
        user = self._branch_user('v143-inactive-role-user', custom_role=role)
        client = APIClient()
        client.force_authenticate(user)
        response = client.get('/api/members/')
        self.assertEqual(response.status_code, 403)

    def test_foreclosure_cannot_access_another_branch_loan_by_id(self):
        user = self._branch_user('v143-foreclose-user', permissions={'collect_payments': True})
        loan = Loan.objects.create(member=self.member_b, product=self.product, principal=Decimal('1000.00'), status='disbursed')
        Installment.objects.create(loan=loan, number=1, due_date=date(2026, 11, 1), principal_due=Decimal('1000.00'), interest_due=Decimal('100.00'))
        client = APIClient()
        client.force_authenticate(user)
        response = client.get(f'/api/loans/{loan.pk}/foreclose/')
        self.assertEqual(response.status_code, 404, response.data)

    def test_payment_reversal_cannot_access_another_branch_payment_by_id(self):
        user = self._branch_user('v143-reverse-user', permissions={'collect_payments': True})
        loan = Loan.objects.create(member=self.member_b, product=self.product, principal=Decimal('1000.00'), status='disbursed')
        payment = Payment.objects.create(
            member=self.member_b, loan=loan, receipt_no='V143-FOREIGN-RCT',
            amount=Decimal('10.00'), method='cash', status='success',
        )
        client = APIClient()
        client.force_authenticate(user)
        response = client.post(f'/api/payments/{payment.pk}/reverse/', {'reason': 'Test unauthorized branch access'}, format='json')
        self.assertEqual(response.status_code, 404, response.data)
        payment.refresh_from_db()
        self.assertFalse(payment.is_reversed)

    def test_installment_fields_cannot_be_mutated_through_generic_api(self):
        loan = Loan.objects.create(member=self.member_a, product=self.product, principal=Decimal('1000.00'), status='disbursed')
        installment = Installment.objects.create(loan=loan, number=1, due_date=date(2026, 11, 1), principal_due=Decimal('1000.00'), interest_due=Decimal('100.00'))
        response = self.client.patch(f'/api/installments/{installment.pk}/', {'principal_paid': '1000.00', 'status': 'paid'}, format='json')
        self.assertEqual(response.status_code, 405)
        installment.refresh_from_db()
        self.assertEqual(installment.principal_paid, Decimal('0.00'))
        self.assertEqual(installment.status, 'pending')

    def test_capital_and_expense_records_cannot_be_edited_after_journal_posting(self):
        capital = CapitalEntry.objects.create(kind='in', amount=Decimal('1000.00'), date=date(2026, 10, 13), created_by=self.admin)
        expense = Expense.objects.create(category='Office', amount=Decimal('100.00'), date=date(2026, 10, 13), branch=self.branch_a)
        capital_response = self.client.patch(f'/api/capital/{capital.pk}/', {'amount': '1.00'}, format='json')
        expense_response = self.client.patch(f'/api/expenses/{expense.pk}/', {'amount': '1.00'}, format='json')
        self.assertEqual(capital_response.status_code, 405)
        self.assertEqual(expense_response.status_code, 405)
        capital.refresh_from_db(); expense.refresh_from_db()
        self.assertEqual(capital.amount, Decimal('1000.00'))
        self.assertEqual(expense.amount, Decimal('100.00'))

    def test_applicant_cannot_set_approved_amount_during_application_creation(self):
        forbidden = self.client.post('/api/applications/', {
            'member': self.member_a.pk, 'product': self.product.pk,
            'requested_amount': '1000.00', 'approved_amount': '100.00', 'purpose': 'Working capital',
        }, format='json')
        self.assertEqual(forbidden.status_code, 400, forbidden.data)
        self.assertFalse(LoanApplication.objects.exists())
        response = self.client.post('/api/applications/', {
            'member': self.member_a.pk, 'product': self.product.pk,
            'requested_amount': '1000.00', 'purpose': 'Working capital',
        }, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        application = LoanApplication.objects.get(pk=response.data['id'])
        self.assertIsNone(application.approved_amount)
        approver = get_user_model().objects.create_user(username='v143-approver', password='test-password-123', is_staff=True)
        client = APIClient(); client.force_authenticate(approver)
        approved = client.post(f'/api/applications/{application.pk}/approve/', {'approved_amount': '750.00'}, format='json')
        self.assertEqual(approved.status_code, 200, approved.data)
        application.refresh_from_db()
        self.assertEqual(application.approved_amount, Decimal('750.00'))
        loan = Loan.objects.get(application=application)
        self.assertEqual(loan.principal, Decimal('750.00'))


    def test_bank_foreclosure_posts_to_selected_bank_and_rejects_changed_retry(self):
        loan = Loan.objects.create(member=self.member_a, product=self.product, principal=Decimal('100.00'), status='disbursed')
        Installment.objects.create(loan=loan, number=1, due_date=date(2026, 11, 1), principal_due=Decimal('100.00'), interest_due=Decimal('10.00'))
        payload = {
            'amount': '110.00', 'idempotency_key': 'V143-FC-BANK-001',
            'method': 'bank', 'bank_account': 'SBI Current A/C', 'paid_on': '2026-10-13',
        }
        first = self.client.post(f'/api/loans/{loan.pk}/foreclose/', payload, format='json')
        self.assertEqual(first.status_code, 201, first.data)
        payment = Payment.objects.get(idempotency_key='V143-FC-BANK-001')
        self.assertEqual(payment.bank_account, 'SBI Current A/C')
        bank_rows = JournalEntry.objects.filter(reference=payment.reference, account='Bank: SBI Current A/C')
        self.assertEqual(sum((row.debit for row in bank_rows), Decimal('0.00')), Decimal('110.00'))
        retry = self.client.post(f'/api/loans/{loan.pk}/foreclose/', payload, format='json')
        self.assertEqual(retry.status_code, 200, retry.data)
        changed = {**payload, 'method': 'cash', 'bank_account': ''}
        mismatch = self.client.post(f'/api/loans/{loan.pk}/foreclose/', changed, format='json')
        self.assertEqual(mismatch.status_code, 409, mismatch.data)
        self.assertEqual(Payment.objects.filter(idempotency_key='V143-FC-BANK-001').count(), 1)

    def test_approver_rejects_non_finite_or_over_requested_amount(self):
        application = LoanApplication.objects.create(member=self.member_a, product=self.product, requested_amount=Decimal('1000.00'))
        for raw in ('NaN', 'Infinity', '1000.01', '0.00', '12.345'):
            with self.subTest(amount=raw):
                response = self.client.post(f'/api/applications/{application.pk}/approve/', {'approved_amount': raw}, format='json')
                self.assertEqual(response.status_code, 400, response.data)
                application.refresh_from_db()
                self.assertEqual(application.status, 'pending')
                self.assertFalse(Loan.objects.filter(application=application).exists())
