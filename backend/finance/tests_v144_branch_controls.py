from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from .models import Branch, StaffProfile, JournalEntry, FundsTransferRequest


class V144BranchControlsTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.maker = User.objects.create_user(username='v144-maker', password='test-password-123', is_staff=True)
        self.approver = User.objects.create_user(username='v144-approver', password='test-password-123', is_staff=True)
        self.branch_a = Branch.objects.create(name='V144 Branch A', code='V144-A')
        self.branch_b = Branch.objects.create(name='V144 Branch B', code='V144-B')
        self.client = APIClient()
        self.client.force_authenticate(self.maker)

    def test_cross_branch_cash_transfer_posts_balanced_branch_tagged_entries(self):
        JournalEntry.objects.create(date=date(2026, 10, 13), entry_type='adjustment', account='Cash', debit=Decimal('100.00'), credit=Decimal('0.00'), reference='V144-OPEN-A', branch=self.branch_a)
        JournalEntry.objects.create(date=date(2026, 10, 13), entry_type='adjustment', account='Capital', debit=Decimal('0.00'), credit=Decimal('100.00'), reference='V144-OPEN-A', branch=self.branch_a)
        payload = {
            'date': '2026-10-13', 'from_account': 'Cash', 'to_account': 'Cash',
            'from_branch': self.branch_a.pk, 'to_branch': self.branch_b.pk,
            'amount': '25.00', 'reference': 'V144-XFER-001', 'note': 'Inter-branch cash transfer',
        }
        created = self.client.post('/api/fund-transfer-requests/', payload, format='json')
        self.assertEqual(created.status_code, 201, created.data)
        transfer_id = created.data['id']
        self.client.force_authenticate(self.approver)
        approved = self.client.post(f'/api/fund-transfer-requests/{transfer_id}/approve/', {'approval_note': 'Verified source cash and destination branch'}, format='json')
        self.assertEqual(approved.status_code, 200, approved.data)
        self.assertEqual(FundsTransferRequest.objects.get(pk=transfer_id).status, 'approved')
        a_rows = JournalEntry.objects.filter(branch=self.branch_a, account='Cash')
        b_rows = JournalEntry.objects.filter(branch=self.branch_b, account='Cash')
        a_balance = sum((r.debit-r.credit for r in a_rows), Decimal('0.00'))
        b_balance = sum((r.debit-r.credit for r in b_rows), Decimal('0.00'))
        self.assertEqual(a_balance, Decimal('75.00'))
        self.assertEqual(b_balance, Decimal('25.00'))
        self.assertEqual(a_balance+b_balance, Decimal('100.00'))
        transfer_rows = JournalEntry.objects.filter(reference='V144-XFER-001')
        self.assertEqual(transfer_rows.count(), 2)
        self.assertEqual(sum((r.debit for r in transfer_rows), Decimal('0.00')), Decimal('25.00'))
        self.assertEqual(sum((r.credit for r in transfer_rows), Decimal('0.00')), Decimal('25.00'))

    def test_branch_user_cannot_read_another_branch_journal(self):
        user = get_user_model().objects.create_user(username='v144-branch-user', password='test-password-123')
        StaffProfile.objects.create(user=user, role='manager', branch=self.branch_a, permissions={'view_accounting': True})
        JournalEntry.objects.create(date=date(2026, 10, 13), entry_type='adjustment', account='Cash', debit=Decimal('10.00'), credit=Decimal('0.00'), reference='V144-A-ROW', branch=self.branch_a)
        JournalEntry.objects.create(date=date(2026, 10, 13), entry_type='adjustment', account='Cash', debit=Decimal('20.00'), credit=Decimal('0.00'), reference='V144-B-ROW', branch=self.branch_b)
        client = APIClient(); client.force_authenticate(user)
        response = client.get('/api/journal/')
        self.assertEqual(response.status_code, 200, response.data)
        rows = response.data.get('results', response.data) if isinstance(response.data, dict) else response.data
        refs = {r['reference'] for r in rows}
        self.assertIn('V144-A-ROW', refs)
        self.assertNotIn('V144-B-ROW', refs)

    def test_unrelated_permission_does_not_grant_fund_transfer_approval(self):
        user = get_user_model().objects.create_user(username='v144-create-only', password='test-password-123')
        StaffProfile.objects.create(user=user, role='accountant', branch=self.branch_a, permissions={'create_fund_transfers': True})
        client = APIClient(); client.force_authenticate(user)
        # This user has no approve_fund_transfers permission; a pending transfer should not be approvable by them.
        JournalEntry.objects.create(date=date(2026, 10, 13), entry_type='adjustment', account='Cash', debit=Decimal('50.00'), credit=Decimal('0.00'), reference='V144-OPEN-B', branch=self.branch_a)
        JournalEntry.objects.create(date=date(2026, 10, 13), entry_type='adjustment', account='Capital', debit=Decimal('0.00'), credit=Decimal('50.00'), reference='V144-OPEN-B', branch=self.branch_a)
        transfer = FundsTransferRequest.objects.create(date=date(2026,10,13), from_account='Cash', to_account='Bank', from_branch=self.branch_a, to_branch=self.branch_a, amount=Decimal('10.00'), reference='V144-PERM-001', created_by=self.maker)
        response = client.post(f'/api/fund-transfer-requests/{transfer.pk}/approve/', {'approval_note':'Try unauthorized approval'}, format='json')
        self.assertEqual(response.status_code, 403, response.data)
        transfer.refresh_from_db()
        self.assertEqual(transfer.status, 'pending')

    def test_explicit_false_user_permission_overrides_custom_role_grant(self):
        from .models import CustomRole
        role=CustomRole.objects.create(name='V144 View Accounting Role',code='v144-view-accounting',permissions={'view_accounting':True},active=True)
        user=get_user_model().objects.create_user(username='v144-revoked-user',password='test-password-123')
        StaffProfile.objects.create(user=user,role='accountant',branch=self.branch_a,custom_role=role,permissions={'view_accounting':False})
        client=APIClient(); client.force_authenticate(user)
        response=client.get('/api/journal/')
        self.assertEqual(response.status_code,403,response.data)

    def test_admin_dashboard_branch_filter_is_scoped_and_does_not_assign_legacy_rows(self):
        from .models import Member
        Member.objects.create(branch=self.branch_a, member_no='V144-MA', name='A member', phone='9000000144')
        Member.objects.create(branch=self.branch_b, member_no='V144-MB', name='B member', phone='9000000145')
        JournalEntry.objects.create(date=date(2026, 10, 13), entry_type='adjustment', account='Cash', debit=Decimal('30.00'), credit=Decimal('0.00'), reference='V144-A-CASH', branch=self.branch_a)
        JournalEntry.objects.create(date=date(2026, 10, 13), entry_type='adjustment', account='Cash', debit=Decimal('999.00'), credit=Decimal('0.00'), reference='V144-LEGACY-CASH', branch=None)
        response=self.client.get(f'/api/dashboard/?branch={self.branch_a.pk}')
        self.assertEqual(response.status_code,200,response.data)
        self.assertEqual(response.data['members'],1)
        self.assertEqual(Decimal(str(response.data['cash_balance'])),Decimal('30.00'))
        self.assertIn('Legacy untagged rows',response.data['scope_notice'])

    def test_admin_can_allocate_reconciled_legacy_balance_to_branch_without_changing_org_total(self):
        JournalEntry.objects.create(date=date(2026, 10, 13), entry_type='adjustment', account='Cash', debit=Decimal('100.00'), credit=Decimal('0.00'), reference='V144-LEGACY-OPEN')
        JournalEntry.objects.create(date=date(2026, 10, 13), entry_type='adjustment', account='Capital', debit=Decimal('0.00'), credit=Decimal('100.00'), reference='V144-LEGACY-OPEN')
        payload={'date':'2026-10-13','from_account':'Cash','to_account':'Cash','from_branch':None,'to_branch':self.branch_a.pk,'amount':'40.00','reference':'V144-ALLOC-001','note':'Allocate reconciled opening cash to Branch A'}
        created=self.client.post('/api/fund-transfer-requests/',payload,format='json')
        self.assertEqual(created.status_code,201,created.data)
        transfer_id=created.data['id']
        self.client.force_authenticate(self.approver)
        approved=self.client.post(f'/api/fund-transfer-requests/{transfer_id}/approve/',{'approval_note':'Verified legacy cash and branch opening balance'},format='json')
        self.assertEqual(approved.status_code,200,approved.data)
        branch_balance=sum((r.debit-r.credit for r in JournalEntry.objects.filter(branch=self.branch_a,account='Cash')),Decimal('0.00'))
        unallocated_balance=sum((r.debit-r.credit for r in JournalEntry.objects.filter(branch__isnull=True,account='Cash')),Decimal('0.00'))
        org_balance=sum((r.debit-r.credit for r in JournalEntry.objects.filter(account='Cash')),Decimal('0.00'))
        self.assertEqual(branch_balance,Decimal('40.00'))
        self.assertEqual(unallocated_balance,Decimal('60.00'))
        self.assertEqual(org_balance,Decimal('100.00'))
