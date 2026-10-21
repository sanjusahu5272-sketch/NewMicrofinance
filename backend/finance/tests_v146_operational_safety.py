from decimal import Decimal
from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient
from .models import Branch, Employee, Member, HouseholdIncomeAssessment, CustomerComplaint, FieldVisitRecord, CashHandoverRequest

class V146OperationalSafetyTests(TestCase):
    def setUp(self):
        User=get_user_model()
        self.maker=User.objects.create_user(username='v146-maker',password='test-password-123',is_staff=True)
        self.approver=User.objects.create_user(username='v146-approver',password='test-password-123',is_staff=True)
        self.branch=Branch.objects.create(name='V146 Branch',code='V146-B')
        self.employee=Employee.objects.create(branch=self.branch,employee_no='V146-E1',name='Officer One',phone='9000000146')
        self.employee2=Employee.objects.create(branch=self.branch,employee_no='V146-E2',name='Officer Two',phone='9000000147')
        self.member=Member.objects.create(branch=self.branch,member_no='V146-M1',name='Member One',phone='9000000148')
        self.client=APIClient();self.client.force_authenticate(self.maker)

    def test_household_assessment_keeps_decimal_amounts_and_is_not_self_verified(self):
        response=self.client.post('/api/household-assessments/',{'member':self.member.pk,'assessment_date':str(timezone.localdate()),'monthly_household_income':'20000.00','existing_monthly_loan_obligations':'4000.00','proposed_monthly_obligation':'3000.00','household_size':4,'verified':True},format='json')
        self.assertEqual(response.status_code,201,response.data)
        row=HouseholdIncomeAssessment.objects.get(pk=response.data['id'])
        self.assertFalse(row.verified)
        self.assertEqual(row.monthly_household_income,Decimal('20000.00'))

    def test_complaint_resolution_requires_note(self):
        created=self.client.post('/api/customer-complaints/',{'branch':self.branch.pk,'member':self.member.pk,'category':'payment','subject':'Receipt missing','description':'Member reports no receipt for payment','received_date':str(timezone.localdate())},format='json')
        self.assertEqual(created.status_code,201,created.data)
        response=self.client.patch(f"/api/customer-complaints/{created.data['id']}/",{'status':'resolved','resolution_note':'x'},format='json')
        self.assertEqual(response.status_code,400,response.data)
        row=CustomerComplaint.objects.get(pk=created.data['id'])
        self.assertEqual(row.status,'open')

    def test_field_visit_is_a_log_not_a_payment(self):
        response=self.client.post('/api/field-visits/',{'member':self.member.pk,'employee':self.employee.pk,'visit_date':timezone.now().isoformat(),'purpose':'Collection follow-up','outcome':'promise','promised_amount':'500.00'},format='json')
        self.assertEqual(response.status_code,201,response.data)
        self.assertEqual(FieldVisitRecord.objects.count(),1)

    def test_cash_handover_maker_checker_and_no_financial_posting(self):
        payload={'branch':self.branch.pk,'handover_date':str(timezone.localdate()),'from_employee':self.employee.pk,'to_employee':self.employee2.pk,'amount':'2500.00','note':'Daily cash custody handover','idempotency_key':'v146-cash-handover-001'}
        created=self.client.post('/api/cash-handovers/',payload,format='json')
        self.assertEqual(created.status_code,201,created.data)
        own=self.client.post(f"/api/cash-handovers/{created.data['id']}/approve/",{'decision_note':'Checked and approved'},format='json')
        self.assertEqual(own.status_code,403,own.data)
        self.client.force_authenticate(self.approver)
        approved=self.client.post(f"/api/cash-handovers/{created.data['id']}/approve/",{'decision_note':'Cash count checked'},format='json')
        self.assertEqual(approved.status_code,200,approved.data)
        self.assertEqual(CashHandoverRequest.objects.get(pk=created.data['id']).status,'approved')
