from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.utils import timezone
from django.test import TestCase
from rest_framework.test import APIClient

from .models import (
    Branch, Employee, Member, LoanProduct, Loan, Installment,
    LoanRecoveryAssignment, OverdueTransferRequest, JournalEntry,
)


class V145OverdueTransferTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.maker = User.objects.create_user(username='v145-maker', password='test-password-123', is_staff=True)
        self.approver = User.objects.create_user(username='v145-approver', password='test-password-123', is_staff=True)
        self.a = Branch.objects.create(name='V145 Branch A', code='V145-A')
        self.b = Branch.objects.create(name='V145 Branch B', code='V145-B')
        self.fo_a = Employee.objects.create(branch=self.a, employee_no='V145-EA', name='Officer A', phone='9000000145')
        self.fo_a2 = Employee.objects.create(branch=self.a, employee_no='V145-EA2', name='Officer A2', phone='9000000148')
        self.fo_b = Employee.objects.create(branch=self.b, employee_no='V145-EB', name='Officer B', phone='9000000146')
        self.member = Member.objects.create(branch=self.a, field_officer=self.fo_a, member_no='V145-M', name='Overdue Member', phone='9000000147')
        product = LoanProduct.objects.create(name='V145 Test Product', code='V145-P', interest_rate=Decimal('12.000'), tenure=12)
        self.loan = Loan.objects.create(member=self.member, product=product, principal=Decimal('1000.00'), interest_total=Decimal('120.00'), total_payable=Decimal('1120.00'), emi_amount=Decimal('100.00'), status='disbursed', disbursed_on=timezone.localdate()-timedelta(days=60))
        Installment.objects.create(loan=self.loan, number=1, due_date=timezone.localdate()-timedelta(days=30), principal_due=Decimal('100.00'), interest_due=Decimal('10.00'), penalty_due=Decimal('0.00'), principal_paid=Decimal('20.00'), interest_paid=Decimal('0.00'), status='partial')
        self.client = APIClient()
        self.client.force_authenticate(self.maker)

    def _payload(self, **overrides):
        data={'loan': self.loan.pk, 'to_branch': self.b.pk, 'to_employee': self.fo_b.pk, 'reason':'Reassign overdue recovery due to field coverage', 'idempotency_key':'v145-key-001'}
        data.update(overrides)
        return data

    def test_cross_branch_transfer_requires_separate_approval_and_does_not_post_money(self):
        before_journal = JournalEntry.objects.count()
        created = self.client.post('/api/overdue-transfers/', self._payload(), format='json')
        self.assertEqual(created.status_code, 201, created.data)
        item_id = created.data['id']
        self.assertEqual(Decimal(created.data['overdue_amount_snapshot']), Decimal('90.00'))
        self.assertEqual(created.data['overdue_installments_snapshot'], 1)
        self.assertEqual(created.data['status'], 'pending')

        # Maker cannot approve their own request.
        denied = self.client.post(f'/api/overdue-transfers/{item_id}/approve/', {'approval_note':'Looks correct'}, format='json')
        self.assertEqual(denied.status_code, 403, denied.data)

        self.client.force_authenticate(self.approver)
        approved = self.client.post(f'/api/overdue-transfers/{item_id}/approve/', {'approval_note':'Verified recovery assignment'}, format='json')
        self.assertEqual(approved.status_code, 200, approved.data)
        assignment = LoanRecoveryAssignment.objects.get(loan=self.loan)
        self.assertEqual(assignment.branch_id, self.b.pk)
        self.assertEqual(assignment.employee_id, self.fo_b.pk)
        self.member.refresh_from_db()
        self.assertEqual(self.member.branch_id, self.a.pk)  # customer ownership is unchanged
        self.assertEqual(JournalEntry.objects.count(), before_journal)  # assignment transfer is not a cash transfer
        self.assertEqual(OverdueTransferRequest.objects.get(pk=item_id).status, 'approved')

    def test_duplicate_pending_transfer_is_blocked_even_with_a_new_idempotency_key(self):
        first = self.client.post('/api/overdue-transfers/', self._payload(), format='json')
        self.assertEqual(first.status_code, 201, first.data)
        second = self.client.post('/api/overdue-transfers/', self._payload(idempotency_key='v145-key-002'), format='json')
        self.assertEqual(second.status_code, 409, second.data)
        self.assertEqual(OverdueTransferRequest.objects.filter(loan=self.loan, status='pending').count(), 1)

    def test_request_rejected_if_overdue_is_paid_before_submission(self):
        installment = self.loan.installments.get(number=1)
        installment.principal_paid = installment.principal_due
        installment.interest_paid = installment.interest_due
        installment.status = 'paid'
        installment.save()
        response = self.client.post('/api/overdue-transfers/', self._payload(), format='json')
        self.assertEqual(response.status_code, 409, response.data)
        self.assertEqual(OverdueTransferRequest.objects.count(), 0)

    def test_employee_must_belong_to_target_branch(self):
        response = self.client.post('/api/overdue-transfers/', self._payload(to_branch=self.b.pk, to_employee=self.fo_a.pk), format='json')
        self.assertEqual(response.status_code, 400, response.data)
        self.assertEqual(OverdueTransferRequest.objects.count(), 0)

    def test_same_branch_staff_transfer_is_supported(self):
        payload=self._payload(to_branch=self.a.pk,to_employee=self.fo_a2.pk,idempotency_key='v145-same-branch')
        response=self.client.post('/api/overdue-transfers/',payload,format='json')
        self.assertEqual(response.status_code,201,response.data)
        self.assertEqual(response.data['from_branch'],self.a.pk)
        self.assertEqual(response.data['to_branch'],self.a.pk)
