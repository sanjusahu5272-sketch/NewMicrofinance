from datetime import date
from decimal import Decimal
from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient
from .models import (
    Branch, Member, LoanProduct, Loan, KycDocument, JournalEntry,
    DepositAccount, DepositCollection, HolidayCalendar, LoanTopUpRequest,
)


class V140WorkflowTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.maker = User.objects.create_user(username='v140-maker', password='test-pass-123', is_staff=True)
        self.approver = User.objects.create_user(username='v140-approver', password='test-pass-123', is_staff=True)
        self.disburser = User.objects.create_user(username='v140-disburser', password='test-pass-123', is_staff=True)
        self.client = APIClient()
        self.client.force_authenticate(self.maker)
        self.branch = Branch.objects.create(name='V140 Branch', code='V140')
        self.member = Member.objects.create(branch=self.branch, member_no='V140-M1', name='V140 Member', phone='9000000000')
        self.product = LoanProduct.objects.create(name='V140 Monthly', code='V140-P1', interest_rate=Decimal('12'), interest_method='flat', frequency='monthly', tenure=6)
        KycDocument.objects.create(member=self.member, document_type='identity', file='private/v140-id.pdf', original_name='v140-id.pdf', verified=True)
        KycDocument.objects.create(member=self.member, document_type='address', file='private/v140-address.pdf', original_name='v140-address.pdf', verified=True)

    def test_holiday_calendar_create_and_list(self):
        response = self.client.post('/api/holidays/', {
            'holiday_date': '2026-12-25', 'name': 'Christmas', 'holiday_type': 'public',
            'branch': self.branch.pk, 'description': 'Test holiday', 'active': True,
        }, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(self.client.get('/api/holidays/').status_code, 200)
        self.assertEqual(HolidayCalendar.objects.count(), 1)

    def test_deposit_collection_only_changes_balance_after_other_user_approves(self):
        account = DepositAccount.objects.create(account_no='DEP-V140-1', member=self.member, created_by=self.maker)
        response = self.client.post('/api/deposit-collections/', {
            'account': account.pk, 'amount': '250.00', 'collection_date': '2026-10-13',
            'method': 'cash', 'reference': 'TEST-DEP-1',
        }, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        item_id = response.data['id']
        account.refresh_from_db()
        self.assertEqual(account.balance, Decimal('0.00'))
        self.client.force_authenticate(self.approver)
        response = self.client.post(f'/api/deposit-collections/{item_id}/approve/', {'approval_note': 'Checked cash receipt'}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        account.refresh_from_db()
        self.assertEqual(account.balance, Decimal('250.00'))
        journal_reference=DepositCollection.objects.get(pk=item_id).journal_reference
        self.assertEqual(JournalEntry.objects.filter(reference=journal_reference).count(), 2)
        # A repeated approval must not post or credit twice.
        response = self.client.post(f'/api/deposit-collections/{item_id}/approve/', {'approval_note': 'Retry'}, format='json')
        self.assertEqual(response.status_code, 409)
        account.refresh_from_db()
        self.assertEqual(account.balance, Decimal('250.00'))
        journal_reference=DepositCollection.objects.get(pk=item_id).journal_reference
        self.assertEqual(JournalEntry.objects.filter(reference=journal_reference).count(), 2)

    def test_topup_approval_and_disbursement_create_separate_loan_and_post_once(self):
        original = Loan.objects.create(member=self.member, product=self.product, principal=Decimal('1000.00'), status='disbursed')
        JournalEntry.objects.create(date=date(2026, 10, 1), entry_type='adjustment', account='Cash', debit=Decimal('5000.00'), credit=Decimal('0.00'), reference='V140-SEED-CASH')
        JournalEntry.objects.create(date=date(2026, 10, 1), entry_type='adjustment', account='Opening Capital', debit=Decimal('0.00'), credit=Decimal('5000.00'), reference='V140-SEED-CASH')
        response = self.client.post('/api/loan-topups/', {'loan': original.pk, 'amount': '300.00', 'reason': 'Emergency working capital'}, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        item_id = response.data['id']
        self.client.force_authenticate(self.approver)
        response = self.client.post(f'/api/loan-topups/{item_id}/approve/', {'approval_note': 'Eligibility checked'}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        original.refresh_from_db()
        self.assertEqual(original.principal, Decimal('1000.00'))
        self.client.force_authenticate(self.disburser)
        response = self.client.post(f'/api/loan-topups/{item_id}/disburse/', {'method': 'cash', 'date': '2026-10-13'}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        item = LoanTopUpRequest.objects.get(pk=item_id)
        self.assertEqual(item.status, 'disbursed')
        self.assertIsNotNone(item.resulting_loan_id)
        self.assertNotEqual(item.resulting_loan_id, original.pk)
        self.assertEqual(item.resulting_loan.principal, Decimal('300.00'))
        self.assertEqual(JournalEntry.objects.filter(reference=f'TOPUP-{item_id}').count(), 2)
        response = self.client.post(f'/api/loan-topups/{item_id}/disburse/', {'method': 'cash', 'date': '2026-10-13'}, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(JournalEntry.objects.filter(reference=f'TOPUP-{item_id}').count(), 2)


    def test_topup_disbursement_rechecks_member_and_product_after_approval(self):
        original = Loan.objects.create(
            member=self.member, product=self.product,
            principal=Decimal('1000.00'), status='disbursed'
        )
        JournalEntry.objects.create(
            date=date(2026, 10, 1), entry_type='adjustment', account='Cash',
            debit=Decimal('5000.00'), credit=Decimal('0.00'), reference='V140-RECHECK-CASH'
        )
        JournalEntry.objects.create(
            date=date(2026, 10, 1), entry_type='adjustment', account='Opening Capital',
            debit=Decimal('0.00'), credit=Decimal('5000.00'), reference='V140-RECHECK-CASH'
        )
        created = self.client.post('/api/loan-topups/', {
            'loan': original.pk, 'amount': '300.00', 'reason': 'Emergency working capital'
        }, format='json')
        self.assertEqual(created.status_code, 201, created.data)
        item_id = created.data['id']

        self.client.force_authenticate(self.approver)
        approved = self.client.post(
            f'/api/loan-topups/{item_id}/approve/',
            {'approval_note': 'Eligibility checked'}, format='json'
        )
        self.assertEqual(approved.status_code, 200, approved.data)

        self.product.active = False
        self.product.save(update_fields=['active', 'updated_at'])
        self.client.force_authenticate(self.disburser)
        response = self.client.post(
            f'/api/loan-topups/{item_id}/disburse/',
            {'method': 'cash', 'date': '2026-10-13'}, format='json'
        )
        self.assertEqual(response.status_code, 400, response.data)
        item = LoanTopUpRequest.objects.get(pk=item_id)
        self.assertEqual(item.status, 'approved')
        self.assertIsNone(item.resulting_loan_id)
        self.assertFalse(JournalEntry.objects.filter(reference=f'TOPUP-{item_id}').exists())
