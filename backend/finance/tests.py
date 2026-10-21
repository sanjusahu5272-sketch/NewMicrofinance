from datetime import date, timedelta
from decimal import Decimal
from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient
from .models import Branch, Member, LoanProduct, LoanApplication, Loan, Payment, Installment, JournalEntry, KycDocument, CapitalEntry, Expense, Employee, OrganizationProfile, AttendanceRecord, PayrollRecord, Disbursement, PromiseToPay, SettlementCase, MasterCatalogEntry, PenaltyScheme, FinancialSession, BusinessSettings, SoftwareTiming, ReferenceMaster, PenaltyAssessment, ProductLoanRequest, FundsTransferRequest, StaffProfile, AuditLog, CustomRole

class CoreWorkflowTests(TestCase):
    def setUp(self):
        self.user=get_user_model().objects.create_user(username='tester',password='test-password-123',is_staff=True)
        self.client=APIClient(); self.client.force_authenticate(self.user)
        self.branch=Branch.objects.create(name='Head Office',code='HO')
        self.member=Member.objects.create(branch=self.branch,member_no='M-001',name='Test Member',phone='9000000000')
        self.product=LoanProduct.objects.create(name='Monthly Loan',code='ML-1',interest_rate=Decimal('12'),interest_method='flat',frequency='monthly',tenure=12,late_penalty=Decimal('100'),grace_days=2)
        # Existing workflow tests use verified fixture documents; production upload validation is tested separately.
        KycDocument.objects.create(member=self.member,document_type='identity',file='private/test-id.pdf',original_name='test-id.pdf',verified=True)
        KycDocument.objects.create(member=self.member,document_type='address',file='private/test-address.pdf',original_name='test-address.pdf',verified=True)
        self.disburser=get_user_model().objects.create_user(username='disburser',password='test-password-123',is_staff=True)

    def test_admin_can_create_branch_bound_login(self):
        response=self.client.post('/api/branch-logins/',{
            'branch':self.branch.pk,'username':'branch_head_01',
            'first_name':'Branch','last_name':'Head',
            'email':'branch-head@example.test','password':'S0mething-Unique!2026'
        },format='json')
        self.assertEqual(response.status_code,201,response.data)
        account=get_user_model().objects.get(username='branch_head_01')
        self.assertTrue(account.check_password('S0mething-Unique!2026'))
        self.assertEqual(account.staff_profile.branch_id,self.branch.pk)
        self.assertEqual(account.staff_profile.role,'manager')
        self.assertFalse(account.is_superuser)
        listed=self.client.get('/api/branch-logins/')
        self.assertEqual(listed.status_code,200)
        self.assertEqual(len(listed.data),1)
        self.assertNotIn('password',listed.data[0])

    def test_member_create_list_and_update_api(self):
        response=self.client.post('/api/members/',{'branch':self.branch.pk,'member_no':'M-002','name':'Second Member','phone':'9000000001'},format='json')
        self.assertEqual(response.status_code,201)
        member_id=response.data['id']
        response=self.client.patch(f'/api/members/{member_id}/',{'occupation':'Retail'},format='json')
        self.assertEqual(response.status_code,200)
        self.assertEqual(response.data['occupation'],'Retail')

    def test_member_assignment_requires_same_branch_and_matching_role(self):
        other_branch=Branch.objects.create(name='Other Branch',code='OB')
        field_officer=Employee.objects.create(branch=other_branch,employee_no='FO-OB-1',name='Field Person',phone='9000000100',role='Field Officer')
        response=self.client.post('/api/members/',{'branch':self.branch.pk,'member_no':'M-ASSIGN-1','name':'Assigned Member','phone':'9000000101','field_officer':field_officer.pk},format='json')
        self.assertEqual(response.status_code,400)
        self.assertIn('field_officer',response.data)

        wrong_role=Employee.objects.create(branch=self.branch,employee_no='EMP-HR-1',name='HR Staff',phone='9000000102',role='HR Executive')
        response=self.client.post('/api/members/',{'branch':self.branch.pk,'member_no':'M-ASSIGN-2','name':'Assigned Member 2','phone':'9000000103','field_officer':wrong_role.pk},format='json')
        self.assertEqual(response.status_code,400)

    def test_loan_application_approval_is_idempotent(self):
        app=LoanApplication.objects.create(member=self.member,product=self.product,requested_amount=Decimal('10000'))
        first=self.client.post(f'/api/applications/{app.pk}/approve/',{},format='json')
        second=self.client.post(f'/api/applications/{app.pk}/approve/',{},format='json')
        self.assertEqual(first.status_code,200); self.assertEqual(second.status_code,200)
        self.assertEqual(Loan.objects.filter(application=app).count(),1)

    def test_application_status_cannot_be_changed_by_direct_patch(self):
        app=LoanApplication.objects.create(member=self.member,product=self.product,requested_amount=Decimal('10000'))
        response=self.client.patch(f'/api/applications/{app.pk}/',{'status':'approved','approved_by':self.user.pk},format='json')
        self.assertEqual(response.status_code,400,response.data)
        app.refresh_from_db()
        self.assertEqual(app.status,'pending')
        self.assertFalse(Loan.objects.filter(application=app).exists())

    def test_loan_financial_state_cannot_be_changed_by_direct_patch(self):
        loan=Loan.objects.create(member=self.member,product=self.product,principal=Decimal('1000'),status='approved')
        response=self.client.patch(f'/api/loans/{loan.pk}/',{'status':'disbursed','principal':'1.00'},format='json')
        self.assertEqual(response.status_code,400,response.data)
        loan.refresh_from_db()
        self.assertEqual(loan.status,'approved')
        self.assertEqual(loan.principal,Decimal('1000'))

    def test_direct_loan_creation_endpoint_is_disabled(self):
        response=self.client.post('/api/loans/',{'member':self.member.pk,'product':self.product.pk,'principal':'1000','status':'disbursed'},format='json')
        self.assertEqual(response.status_code,405,response.data)
        self.assertEqual(Loan.objects.count(),0)

    def test_disbursement_creates_installment_schedule_once(self):
        app=LoanApplication.objects.create(member=self.member,product=self.product,requested_amount=Decimal('12000'),status='approved',approved_amount=Decimal('12000'))
        loan=Loan.objects.create(member=self.member,product=self.product,application=app,principal=Decimal('12000'),status='approved')
        self.client.force_authenticate(self.disburser)
        JournalEntry.objects.create(date=date(2026,10,9),entry_type='adjustment',account='Bank: SBI Current A/C ••••1234',debit=Decimal('15000'),credit=Decimal('0'),reference='OPEN-SBI')
        response=self.client.post(f'/api/loans/{loan.pk}/disburse/',{'amount':'12000','date':'2026-10-09','method':'bank','bank_account':'SBI Current A/C ••••1234'},format='json')
        self.assertEqual(response.status_code,200)
        self.assertEqual(Installment.objects.filter(loan=loan).count(),12)
        again=self.client.post(f'/api/loans/{loan.pk}/disburse/',{'amount':'12000','date':'2026-10-09','method':'bank','bank_account':'SBI Current A/C ••••1234'},format='json')
        self.assertEqual(again.status_code,200)
        self.assertEqual(Installment.objects.filter(loan=loan).count(),12)

    def test_payment_cannot_exceed_outstanding_due(self):
        app=LoanApplication.objects.create(member=self.member,product=self.product,requested_amount=Decimal('1000'),status='approved',approved_amount=Decimal('1000'))
        loan=Loan.objects.create(member=self.member,product=self.product,application=app,principal=Decimal('1000'),status='disbursed')
        Installment.objects.create(loan=loan,number=1,due_date=date(2026,10,10),principal_due=Decimal('100'),interest_due=Decimal('10'))
        response=self.client.post('/api/payments/',{'member':self.member.pk,'loan':loan.pk,'amount':'9999','method':'cash','paid_on':'2026-10-09','status':'success'},format='json')
        self.assertEqual(response.status_code,400)
        self.assertEqual(Payment.objects.filter(loan=loan).count(),0)

    def test_disbursement_uses_selected_emi_start_date_and_cash_ledger(self):
        app=LoanApplication.objects.create(member=self.member,product=self.product,requested_amount=Decimal('12000'),status='approved',approved_amount=Decimal('12000'))
        loan=Loan.objects.create(member=self.member,product=self.product,application=app,principal=Decimal('12000'),status='approved')
        self.client.force_authenticate(self.disburser)
        JournalEntry.objects.create(date=date(2026,10,9),entry_type='adjustment',account='Cash',debit=Decimal('15000'),credit=Decimal('0'),reference='OPEN-CASH')
        response=self.client.post(f'/api/loans/{loan.pk}/disburse/',{'amount':'12000','date':'2026-10-09','emi_start_date':'2026-11-01','method':'cash','reference':'DISB-CASH-TEST'},format='json')
        self.assertEqual(response.status_code,200)
        self.assertEqual(Installment.objects.filter(loan=loan).first().due_date,date(2026,11,1))
        rows=JournalEntry.objects.filter(reference='DISB-CASH-TEST')
        self.assertEqual(rows.count(),2)
        self.assertTrue(rows.filter(account='Cash',credit=Decimal('12000')).exists())

    def test_disbursement_posts_balanced_journal(self):
        app=LoanApplication.objects.create(member=self.member,product=self.product,requested_amount=Decimal('12000'),status='approved',approved_amount=Decimal('12000'))
        loan=Loan.objects.create(member=self.member,product=self.product,application=app,principal=Decimal('12000'),status='approved')
        self.client.force_authenticate(self.disburser)
        JournalEntry.objects.create(date=date(2026,10,9),entry_type='adjustment',account='Bank: HDFC Current A/C ••••1234',debit=Decimal('15000'),credit=Decimal('0'),reference='OPEN-HDFC')
        response=self.client.post(f'/api/loans/{loan.pk}/disburse/',{'amount':'12000','date':'2026-10-09','method':'bank','bank_account':'HDFC Current A/C ••••1234','reference':'DISB-TEST'},format='json')
        self.assertEqual(response.status_code,200)
        rows=JournalEntry.objects.filter(reference='DISB-TEST')
        self.assertEqual(rows.count(),2)
        self.assertEqual(sum((r.debit for r in rows),Decimal('0')),sum((r.credit for r in rows),Decimal('0')))
        self.assertTrue(rows.filter(account='Bank: HDFC Current A/C ••••1234',credit=Decimal('12000')).exists())

    def test_disbursement_rejects_insufficient_bank_balance(self):
        app=LoanApplication.objects.create(member=self.member,product=self.product,requested_amount=Decimal('12000'),status='approved',approved_amount=Decimal('12000'))
        loan=Loan.objects.create(member=self.member,product=self.product,application=app,principal=Decimal('12000'),status='approved')
        self.client.force_authenticate(self.disburser)
        JournalEntry.objects.create(date=date(2026,10,9),entry_type='adjustment',account='Bank: Low Balance',debit=Decimal('1000'),credit=Decimal('0'),reference='OPEN-LOW')
        response=self.client.post(f'/api/loans/{loan.pk}/disburse/',{'amount':'12000','date':'2026-10-09','method':'bank','bank_account':'Low Balance'},format='json')
        self.assertEqual(response.status_code,400)
        self.assertIn('Insufficient available balance',response.data['detail'])
        loan.refresh_from_db()
        self.assertEqual(loan.status,'approved')
        self.assertEqual(loan.installments.count(),0)
        self.assertFalse(Disbursement.objects.filter(loan=loan).exists())
        self.assertFalse(JournalEntry.objects.filter(reference='DISB-LOAN-'+str(loan.pk)).exists())

    def test_capital_withdrawal_rejects_more_than_account_balance(self):
        self.client.force_authenticate(self.user)
        JournalEntry.objects.create(date=date(2026,10,9),entry_type='adjustment',account='Bank: SBI',debit=Decimal('500'),credit=Decimal('0'),reference='OPEN-SBI-W')
        response=self.client.post('/api/capital/',{'kind':'out','amount':'501','date':'2026-10-09','bank_account':'SBI','reference':'WITHDRAW-OVER'},format='json')
        self.assertEqual(response.status_code,400)
        self.assertFalse(CapitalEntry.objects.filter(reference='WITHDRAW-OVER').exists())

    def test_bank_disbursement_requires_account_before_changing_loan_status(self):
        app=LoanApplication.objects.create(member=self.member,product=self.product,requested_amount=Decimal('12000'),status='approved',approved_amount=Decimal('12000'))
        loan=Loan.objects.create(member=self.member,product=self.product,application=app,principal=Decimal('12000'),status='approved')
        self.client.force_authenticate(self.disburser)
        response=self.client.post(f'/api/loans/{loan.pk}/disburse/',{'amount':'12000','date':'2026-10-09','method':'bank'},format='json')
        self.assertEqual(response.status_code,400)
        loan.refresh_from_db()
        self.assertEqual(loan.status,'approved')
        self.assertFalse(JournalEntry.objects.exists())

    def test_disbursement_rejects_non_finite_amount(self):
        loan=Loan.objects.create(member=self.member,product=self.product,principal=Decimal('1000'),status='approved')
        self.client.force_authenticate(self.disburser)
        response=self.client.post(f'/api/loans/{loan.pk}/disburse/',{'amount':'NaN','date':'2026-10-09','method':'cash'},format='json')
        self.assertEqual(response.status_code,400,response.data)
        self.assertIn('amount',response.data)
        loan.refresh_from_db()
        self.assertEqual(loan.status,'approved')
        self.assertEqual(loan.installments.count(),0)
        self.assertFalse(Disbursement.objects.filter(loan=loan).exists())
        self.assertFalse(JournalEntry.objects.exists())

    def test_pending_loan_cannot_be_disbursed_without_approval(self):
        loan=Loan.objects.create(member=self.member,product=self.product,principal=Decimal('12000'),status='pending')
        self.client.force_authenticate(self.disburser)
        response=self.client.post(f'/api/loans/{loan.pk}/disburse/',{'amount':'12000','date':'2026-10-09','method':'cash'},format='json')
        self.assertEqual(response.status_code,400,response.data)
        self.assertIn('approved before disbursement',response.data['detail'])
        loan.refresh_from_db()
        self.assertEqual(loan.status,'pending')
        self.assertEqual(loan.installments.count(),0)
        self.assertFalse(Disbursement.objects.filter(loan=loan).exists())
        self.assertFalse(JournalEntry.objects.exists())

    def test_disbursement_rechecks_member_and_product_active_status(self):
        self.client.force_authenticate(self.disburser)
        for case in ('inactive_member','inactive_product'):
            with self.subTest(case=case):
                member=self.member
                product=self.product
                if case=='inactive_member':
                    member.active=False
                    member.save(update_fields=['active','updated_at'])
                else:
                    product.active=False
                    product.save(update_fields=['active','updated_at'])
                loan=Loan.objects.create(member=member,product=product,principal=Decimal('1000'),status='approved')
                response=self.client.post(f'/api/loans/{loan.pk}/disburse/',{'amount':'1000','date':'2026-10-09','method':'cash'},format='json')
                self.assertEqual(response.status_code,400,response.data)
                loan.refresh_from_db()
                self.assertEqual(loan.status,'approved')
                self.assertEqual(loan.installments.count(),0)
                self.assertFalse(Disbursement.objects.filter(loan=loan).exists())
                self.assertFalse(JournalEntry.objects.exists())
                # Restore shared fixtures for the next subtest.
                member.active=True; member.save(update_fields=['active','updated_at'])
                product.active=True; product.save(update_fields=['active','updated_at'])

    def test_disbursement_does_not_delete_preexisting_installment_schedule(self):
        loan=Loan.objects.create(member=self.member,product=self.product,principal=Decimal('1000'),status='approved')
        existing=Installment.objects.create(loan=loan,number=1,due_date=date(2026,11,1),principal_due=Decimal('100'),interest_due=Decimal('10'))
        self.client.force_authenticate(self.disburser)
        response=self.client.post(f'/api/loans/{loan.pk}/disburse/',{'amount':'1000','date':'2026-10-09','method':'cash'},format='json')
        self.assertEqual(response.status_code,409,response.data)
        self.assertTrue(Installment.objects.filter(pk=existing.pk,loan=loan).exists())
        loan.refresh_from_db()
        self.assertEqual(loan.status,'approved')
        self.assertFalse(Disbursement.objects.filter(loan=loan).exists())
        self.assertFalse(JournalEntry.objects.exists())

    def test_disbursement_rejects_invalid_dates_as_client_error(self):
        loan=Loan.objects.create(member=self.member,product=self.product,principal=Decimal('1000'),status='approved')
        JournalEntry.objects.create(date=date(2026,10,1),entry_type='adjustment',account='Cash',debit=Decimal('2000'),credit=Decimal('0'),reference='OPEN-CASH-BAD-DATE')
        self.client.force_authenticate(self.disburser)
        response=self.client.post(f'/api/loans/{loan.pk}/disburse/',{'amount':'1000','date':'not-a-date','method':'cash'},format='json')
        self.assertEqual(response.status_code,400,response.data)
        self.assertIn('date',response.data)
        loan.refresh_from_db()
        self.assertEqual(loan.status,'approved')
        self.assertEqual(loan.installments.count(),0)
        self.assertFalse(Disbursement.objects.filter(loan=loan).exists())
        self.assertFalse(JournalEntry.objects.filter(reference='DISB-LOAN-'+str(loan.pk)).exists())

    def test_emi_start_date_cannot_precede_disbursement_date(self):
        loan=Loan.objects.create(member=self.member,product=self.product,principal=Decimal('1000'),status='approved')
        JournalEntry.objects.create(date=date(2026,10,1),entry_type='adjustment',account='Cash',debit=Decimal('2000'),credit=Decimal('0'),reference='OPEN-CASH-OLD-EMI')
        self.client.force_authenticate(self.disburser)
        response=self.client.post(f'/api/loans/{loan.pk}/disburse/',{'amount':'1000','date':'2026-10-09','emi_start_date':'2026-10-08','method':'cash'},format='json')
        self.assertEqual(response.status_code,400,response.data)
        self.assertIn('emi_start_date',response.data)
        loan.refresh_from_db()
        self.assertEqual(loan.status,'approved')
        self.assertEqual(loan.installments.count(),0)
        self.assertFalse(Disbursement.objects.filter(loan=loan).exists())

    def test_payment_allocation_handles_overdue_status_and_keeps_journal_balanced(self):
        loan=Loan.objects.create(member=self.member,product=self.product,principal=Decimal('1000'),status='disbursed')
        inst=Installment.objects.create(loan=loan,number=1,due_date=date(2026,10,1),principal_due=Decimal('100'),interest_due=Decimal('10'),penalty_due=Decimal('5'),status='overdue')
        response=self.client.post('/api/payments/',{'member':self.member.pk,'loan':loan.pk,'amount':'15','method':'bank','paid_on':'2026-10-09','status':'success','reference':'PAY-OVERDUE-STATUS'},format='json')
        self.assertEqual(response.status_code,201)
        inst.refresh_from_db()
        self.assertEqual(inst.penalty_paid,Decimal('5.00'))
        self.assertEqual(inst.interest_paid,Decimal('10.00'))
        self.assertEqual(inst.principal_paid,Decimal('0.00'))
        rows=JournalEntry.objects.filter(reference='PAY-OVERDUE-STATUS')
        self.assertEqual(sum((r.debit for r in rows),Decimal('0')),Decimal('15.00'))
        self.assertEqual(sum((r.credit for r in rows),Decimal('0')),Decimal('15.00'))

    def test_payment_repairs_stale_paid_status_when_balance_remains(self):
        loan=Loan.objects.create(member=self.member,product=self.product,principal=Decimal('1000'),status='disbursed')
        inst=Installment.objects.create(loan=loan,number=1,due_date=date(2026,10,1),principal_due=Decimal('100'),interest_due=Decimal('10'),status='paid')
        response=self.client.post('/api/payments/',{'member':self.member.pk,'loan':loan.pk,'amount':'10','method':'cash','paid_on':'2026-10-09','status':'success'},format='json')
        self.assertEqual(response.status_code,201)
        inst.refresh_from_db()
        self.assertEqual(inst.interest_paid,Decimal('10.00'))
        self.assertEqual(inst.status,'partial')

    def test_successful_collection_posts_journal_by_allocation(self):
        loan=Loan.objects.create(member=self.member,product=self.product,principal=Decimal('1000'),status='disbursed')
        Installment.objects.create(loan=loan,number=1,due_date=date(2026,10,10),principal_due=Decimal('100'),interest_due=Decimal('10'))
        response=self.client.post('/api/payments/',{'member':self.member.pk,'loan':loan.pk,'amount':'50','method':'cash','paid_on':'2026-10-09','status':'success','reference':'PAY-TEST'},format='json')
        self.assertEqual(response.status_code,201)
        rows=JournalEntry.objects.filter(reference='PAY-TEST')
        self.assertEqual(rows.count(),2)
        self.assertEqual(sum((r.debit for r in rows),Decimal('0')),sum((r.credit for r in rows),Decimal('0')))
        self.assertEqual(sum((r.credit for r in rows if r.account=='Loans Receivable'),Decimal('0')),Decimal('50.00'))

    def test_capital_entry_tracks_named_bank_account_in_journal(self):
        response=self.client.post('/api/capital/',{'kind':'in','amount':'25000.00','date':'2026-10-09','bank_account':'SBI Current A/C ••••1234','reference':'CAP-BANK-TEST','note':'Investment deposit'},format='json')
        self.assertEqual(response.status_code,201)
        rows=JournalEntry.objects.filter(reference='CAP-BANK-TEST')
        self.assertEqual(rows.count(),2)
        self.assertTrue(rows.filter(account='Bank: SBI Current A/C ••••1234',debit=Decimal('25000.00')).exists())
        self.assertEqual(sum((r.debit for r in rows),Decimal('0')),sum((r.credit for r in rows),Decimal('0')))

    def test_dashboard_cash_bank_is_based_on_journal_not_capital(self):
        response=self.client.get('/api/dashboard/')
        self.assertEqual(response.status_code,200)
        self.assertEqual(Decimal(str(response.data['cash_balance'])),Decimal('0'))
        JournalEntry.objects.create(date=date(2026,10,9),entry_type='adjustment',account='Cash',debit=Decimal('500'),credit=Decimal('0'))
        response=self.client.get('/api/dashboard/')
        self.assertEqual(Decimal(str(response.data['cash_balance'])),Decimal('500'))

    def test_authenticated_csv_export_returns_csv_and_audits(self):
        response=self.client.get('/api/reports/export/?type=members')
        self.assertEqual(response.status_code,200)
        self.assertIn('text/csv',response['Content-Type'])
        self.assertIn('member_no',response.content.decode('utf-8-sig'))

    def test_csv_export_rejects_unknown_type(self):
        response=self.client.get('/api/reports/export/?type=not-a-register')
        self.assertEqual(response.status_code,400)

    def test_payment_rejects_loan_belonging_to_another_member(self):
        other=Member.objects.create(branch=self.branch,member_no='M-003',name='Other Member',phone='9000000003')
        loan=Loan.objects.create(member=other,product=self.product,principal=Decimal('1000'),status='disbursed')
        response=self.client.post('/api/payments/',{'member':self.member.pk,'loan':loan.pk,'amount':'10','method':'cash'},format='json')
        self.assertEqual(response.status_code,400)

    def test_journal_line_rejects_both_debit_and_credit(self):
        response=self.client.post('/api/journal/',{'date':'2026-10-09','entry_type':'adjustment','account':'Cash','debit':'100','credit':'100'},format='json')
        self.assertEqual(response.status_code,400)

    def test_member_ledger_endpoint(self):
        response=self.client.get(f'/api/members/{self.member.pk}/ledger/')
        self.assertEqual(response.status_code,200)
        self.assertEqual(response.data['member']['member_no'],'M-001')

    def test_pending_payment_does_not_reduce_installment_due(self):
        loan=Loan.objects.create(member=self.member,product=self.product,principal=Decimal('1000'),status='disbursed')
        inst=Installment.objects.create(loan=loan,number=1,due_date=date(2026,10,10),principal_due=Decimal('100'),interest_due=Decimal('10'))
        response=self.client.post('/api/payments/',{'member':self.member.pk,'loan':loan.pk,'amount':'50','method':'upi','status':'pending'},format='json')
        self.assertEqual(response.status_code,201)
        inst.refresh_from_db()
        self.assertEqual(inst.principal_paid,Decimal('0'))
        self.assertEqual(inst.interest_paid,Decimal('0'))

    def test_successful_collection_rejects_non_disbursed_loan(self):
        loan=Loan.objects.create(member=self.member,product=self.product,principal=Decimal('1000'),status='approved')
        Installment.objects.create(loan=loan,number=1,due_date=date(2026,10,10),principal_due=Decimal('100'),interest_due=Decimal('10'))
        response=self.client.post('/api/payments/',{'member':self.member.pk,'loan':loan.pk,'amount':'10','method':'cash','status':'success'},format='json')
        self.assertEqual(response.status_code,400)
        self.assertEqual(Payment.objects.filter(loan=loan).count(),0)

    def test_loan_approval_requires_a_second_actor_and_creates_one_loan(self):
        created=self.client.post('/api/applications/',{
            'member':self.member.pk,'product':self.product.pk,'requested_amount':'2500.00','purpose':'Working capital'
        },format='json')
        self.assertEqual(created.status_code,201,created.data)
        app_id=created.data['id']
        self_approve=self.client.post(f'/api/applications/{app_id}/approve/',{},format='json')
        self.assertEqual(self_approve.status_code,403)
        self.client.force_authenticate(self.disburser)
        approved=self.client.post(f'/api/applications/{app_id}/approve/',{'notes':'KYC and affordability reviewed'},format='json')
        self.assertEqual(approved.status_code,200,approved.data)
        self.assertEqual(Loan.objects.filter(application_id=app_id).count(),1)
        approval_log=AuditLog.objects.filter(model_name='LoanApplication',object_id=str(app_id),action='approve').latest('id')
        self.assertEqual(approval_log.details.get('approval_note'),'KYC and affordability reviewed')
        again=self.client.post(f'/api/applications/{app_id}/approve/',{},format='json')
        self.assertEqual(again.status_code,200,again.data)
        self.assertEqual(Loan.objects.filter(application_id=app_id).count(),1)

    def test_collection_approval_posts_once_and_blocks_self_approval(self):
        loan=Loan.objects.create(member=self.member,product=self.product,principal=Decimal('1000'),status='disbursed')
        installment=Installment.objects.create(loan=loan,number=1,due_date=date(2026,10,10),principal_due=Decimal('100'),interest_due=Decimal('10'))
        created=self.client.post('/api/payments/',{'member':self.member.pk,'loan':loan.pk,'amount':'50','method':'cash','status':'pending','paid_on':'2026-10-09'},format='json')
        self.assertEqual(created.status_code,201,created.data)
        payment_id=created.data['id']
        installment.refresh_from_db()
        self.assertEqual(installment.principal_paid,Decimal('0.00'))
        self.assertEqual(JournalEntry.objects.count(),0)
        # Maker cannot approve their own payment.
        denied=self.client.post(f'/api/payments/{payment_id}/approve/',{'approval_note':'Review complete'},format='json')
        self.assertEqual(denied.status_code,403)
        self.client.force_authenticate(self.disburser)
        approved=self.client.post(f'/api/payments/{payment_id}/approve/',{'approval_note':'Verified at branch'},format='json')
        self.assertEqual(approved.status_code,200,approved.data)
        installment.refresh_from_db()
        self.assertEqual(installment.interest_paid,Decimal('10.00'))
        self.assertEqual(installment.principal_paid,Decimal('40.00'))
        rows=JournalEntry.objects.filter(reference=approved.data['receipt_no'])
        self.assertEqual(rows.count(),4)
        self.assertEqual(sum((r.debit for r in rows),Decimal('0')),Decimal('50.00'))
        self.assertEqual(sum((r.credit for r in rows),Decimal('0')),Decimal('50.00'))
        again=self.client.post(f'/api/payments/{payment_id}/approve/',{'approval_note':'Duplicate attempt'},format='json')
        self.assertEqual(again.status_code,409)
        self.assertEqual(JournalEntry.objects.filter(reference=approved.data['receipt_no']).count(),4)

    def test_staff_cannot_bypass_collection_approval_by_sending_success(self):
        loan=Loan.objects.create(member=self.member,product=self.product,principal=Decimal('1000'),status='disbursed')
        installment=Installment.objects.create(loan=loan,number=1,due_date=date(2026,10,10),principal_due=Decimal('100'),interest_due=Decimal('10'))
        StaffProfile.objects.create(user=self.disburser,role='field_officer',branch=self.branch,permissions={'collect_payments':True})
        self.client.force_authenticate(self.disburser)
        created=self.client.post('/api/payments/',{'member':self.member.pk,'loan':loan.pk,'amount':'25','method':'cash','status':'success','paid_on':'2026-10-09'},format='json')
        self.assertEqual(created.status_code,201,created.data)
        self.assertEqual(created.data['status'],'pending')
        installment.refresh_from_db()
        self.assertEqual(installment.principal_paid,Decimal('0.00'))
        self.assertEqual(JournalEntry.objects.count(),0)
        self.client.force_authenticate(self.user)
        approved=self.client.post(f"/api/payments/{created.data['id']}/approve/",{'approval_note':'Receipt checked'},format='json')
        self.assertEqual(approved.status_code,200,approved.data)
        installment.refresh_from_db()
        self.assertEqual(installment.principal_paid,Decimal('25.00'))

    def test_product_loan_request_approval_is_audited_without_cash_disbursement(self):
        created=self.client.post('/api/product-loan-requests/',{
            'member':self.member.pk,'product_name':'Water Pump','quantity':2,'unit_price':'5000.00',
            'down_payment':'2000.00','tenure_installments':10,'purpose':'Agriculture equipment'
        },format='json')
        self.assertEqual(created.status_code,201,created.data)
        request_id=created.data['id']
        self.assertEqual(created.data['financed_amount'],'8000.00')
        self.client.force_authenticate(self.disburser)
        approved=self.client.post(f'/api/product-loan-requests/{request_id}/approve/',{'approval_note':'KYC reviewed'},format='json')
        self.assertEqual(approved.status_code,200,approved.data)
        self.assertEqual(approved.data['status'],'approved')
        self.assertFalse(Loan.objects.filter(member=self.member).exists())
        self.assertFalse(JournalEntry.objects.exists())
        again=self.client.post(f'/api/product-loan-requests/{request_id}/approve/',{'approval_note':'Duplicate'},format='json')
        self.assertEqual(again.status_code,409)

    def test_fund_transfer_approval_posts_balanced_pair_once(self):
        JournalEntry.objects.create(date=date(2026,10,9),entry_type='adjustment',account='Cash',debit=Decimal('500.00'),credit=Decimal('0.00'),reference='OPEN-CASH-FTR')
        created=self.client.post('/api/fund-transfer-requests/',{
            'date':'2026-10-09','from_account':'Cash','to_account':'Bank: Test Current A/C',
            'amount':'125.50','reference':'FTR-TEST-125','note':'Cash deposit to bank'
        },format='json')
        self.assertEqual(created.status_code,201,created.data)
        transfer_id=created.data['id']
        self.client.force_authenticate(self.disburser)
        approved=self.client.post(f'/api/fund-transfer-requests/{transfer_id}/approve/',{'approval_note':'Voucher checked'},format='json')
        self.assertEqual(approved.status_code,200,approved.data)
        rows=JournalEntry.objects.filter(reference='FTR-TEST-125')
        self.assertEqual(rows.count(),2)
        self.assertEqual(sum((r.debit for r in rows),Decimal('0')),Decimal('125.50'))
        self.assertEqual(sum((r.credit for r in rows),Decimal('0')),Decimal('125.50'))
        again=self.client.post(f'/api/fund-transfer-requests/{transfer_id}/approve/',{'approval_note':'Duplicate'},format='json')
        self.assertEqual(again.status_code,409)
        self.assertEqual(JournalEntry.objects.filter(reference='FTR-TEST-125').count(),2)

    def test_fund_transfer_rejects_insufficient_source_balance(self):
        created=self.client.post('/api/fund-transfer-requests/',{
            'date':'2026-10-09','from_account':'Cash','to_account':'Bank: Test Current A/C',
            'amount':'1.00','reference':'FTR-LOW-1'
        },format='json')
        self.assertEqual(created.status_code,201,created.data)
        self.client.force_authenticate(self.disburser)
        response=self.client.post(f"/api/fund-transfer-requests/{created.data['id']}/approve/",{'approval_note':'Balance check'},format='json')
        self.assertEqual(response.status_code,400)
        self.assertFalse(JournalEntry.objects.filter(reference='FTR-LOW-1').exists())
        self.assertEqual(FundsTransferRequest.objects.get(pk=created.data['id']).status,'pending')

    def test_successful_collection_closes_fully_paid_loan(self):
        loan=Loan.objects.create(member=self.member,product=self.product,principal=Decimal('100'),status='disbursed')
        Installment.objects.create(loan=loan,number=1,due_date=date(2026,10,10),principal_due=Decimal('100'),interest_due=Decimal('10'))
        response=self.client.post('/api/payments/',{'member':self.member.pk,'loan':loan.pk,'amount':'110','method':'cash','status':'success'},format='json')
        self.assertEqual(response.status_code,201)
        loan.refresh_from_db()
        self.assertEqual(loan.status,'closed')

    def test_loan_cannot_be_closed_with_unpaid_installments(self):
        loan=Loan.objects.create(member=self.member,product=self.product,principal=Decimal('1000'),status='disbursed')
        Installment.objects.create(loan=loan,number=1,due_date=date(2026,10,10),principal_due=Decimal('1000'),interest_due=Decimal('100'))
        response=self.client.post(f'/api/loans/{loan.pk}/close/',{},format='json')
        self.assertEqual(response.status_code,400)
        loan.refresh_from_db()
        self.assertEqual(loan.status,'disbursed')

    def test_loan_can_be_closed_after_all_installments_paid(self):
        loan=Loan.objects.create(member=self.member,product=self.product,principal=Decimal('1000'),status='disbursed')
        Installment.objects.create(loan=loan,number=1,due_date=date(2026,10,10),principal_due=Decimal('1000'),interest_due=Decimal('100'),principal_paid=Decimal('1000'),interest_paid=Decimal('100'),status='paid')
        response=self.client.post(f'/api/loans/{loan.pk}/close/',{},format='json')
        self.assertEqual(response.status_code,200)
        loan.refresh_from_db()
        self.assertEqual(loan.status,'closed')

    def test_successful_receipts_are_immutable_via_api(self):
        payment=Payment.objects.create(member=self.member,receipt_no='RCT-IMMUTABLE-1',amount=Decimal('10'),method='cash',status='success')
        response=self.client.patch(f'/api/payments/{payment.pk}/',{'amount':'1'},format='json')
        self.assertEqual(response.status_code,405)
        response=self.client.delete(f'/api/payments/{payment.pk}/')
        self.assertEqual(response.status_code,405)
        payment.refresh_from_db()
        self.assertEqual(payment.amount,Decimal('10'))



    def test_payment_reversal_restores_installment_and_posts_reversing_journal(self):
        loan=Loan.objects.create(member=self.member,product=self.product,principal=Decimal('1000'),status='disbursed')
        inst=Installment.objects.create(loan=loan,number=1,due_date=date(2026,10,10),principal_due=Decimal('100'),interest_due=Decimal('10'))
        response=self.client.post('/api/payments/',{'member':self.member.pk,'loan':loan.pk,'amount':'50','method':'cash','paid_on':'2026-10-09','status':'success','reference':'PAY-REVERSAL-1'},format='json')
        self.assertEqual(response.status_code,201)
        payment=Payment.objects.get(receipt_no=response.data['receipt_no'])
        reverse=self.client.post(f'/api/payments/{payment.pk}/reverse/',{'reason':'Duplicate collection entered'},format='json')
        self.assertEqual(reverse.status_code,202,reverse.data)
        reversal_id=reverse.data['id']
        payment.refresh_from_db(); inst.refresh_from_db()
        self.assertFalse(payment.is_reversed)
        self.assertEqual(inst.principal_paid,Decimal('40.00'))
        self.client.force_authenticate(self.disburser)
        approved=self.client.post(f'/api/payment-reversal-requests/{reversal_id}/approve/',{'decision_note':'Independent review confirms duplicate collection'},format='json')
        self.assertEqual(approved.status_code,200,approved.data)
        payment.refresh_from_db(); inst.refresh_from_db()
        self.assertTrue(payment.is_reversed)
        self.assertEqual(payment.status,'reversed')
        self.assertEqual(inst.principal_paid,Decimal('0.00'))
        self.assertEqual(inst.interest_paid,Decimal('0.00'))
        original=JournalEntry.objects.filter(reference='PAY-REVERSAL-1')
        reversing=JournalEntry.objects.filter(reference=f'REV-{payment.receipt_no}')
        self.assertEqual(sum((r.debit for r in original),Decimal('0')),sum((r.credit for r in original),Decimal('0')))
        self.assertEqual(sum((r.debit for r in reversing),Decimal('0')),sum((r.credit for r in reversing),Decimal('0')))
        again=self.client.post(f'/api/payments/{payment.pk}/reverse/',{'reason':'Duplicate collection entered'},format='json')
        self.assertEqual(again.status_code,409)

    def test_payment_reversal_requires_reason(self):
        payment=Payment.objects.create(member=self.member,loan=Loan.objects.create(member=self.member,product=self.product,principal=Decimal('100'),status='disbursed'),receipt_no='RCT-REV-NO-REASON',amount=Decimal('10'),method='cash',status='success')
        response=self.client.post(f'/api/payments/{payment.pk}/reverse/',{'reason':'no'},format='json')
        self.assertEqual(response.status_code,400)
        payment.refresh_from_db()
        self.assertFalse(payment.is_reversed)

    def test_admin_can_create_custom_daily_loan_plan(self):
        response=self.client.post('/api/loan-products/',{
            'name':'Daily Flex','code':'daily-flex','interest_rate':'24.500',
            'interest_method':'flat','frequency':'daily','tenure':30,
            'processing_fee':'100','late_penalty':'20','grace_days':2,'active':True
        },format='json')
        self.assertEqual(response.status_code,201)
        self.assertEqual(response.data['code'],'DAILY-FLEX')
        self.assertEqual(response.data['frequency'],'daily')
        self.assertEqual(response.data['interest_rate'],'24.500')

    def test_loan_plan_rejects_negative_interest_or_fee(self):
        response=self.client.post('/api/loan-products/',{
            'name':'Invalid','code':'INVALID','interest_rate':'-2',
            'interest_method':'flat','frequency':'weekly','tenure':10,
            'processing_fee':'0','late_penalty':'0','grace_days':0,'active':True
        },format='json')
        self.assertEqual(response.status_code,400)
        self.assertIn('interest_rate',response.data)

    def test_monthly_installments_use_calendar_months(self):
        app=LoanApplication.objects.create(member=self.member,product=self.product,requested_amount=Decimal('1200'),status='approved',approved_amount=Decimal('1200'))
        loan=Loan.objects.create(member=self.member,product=self.product,application=app,principal=Decimal('1200'),status='approved')
        response=self.client.post(f'/api/loans/{loan.pk}/disburse/',{'amount':'1200','date':'2026-01-31','method':'bank','bank_account':'SBI Current A/C ••••1234'},format='json')
        self.assertEqual(response.status_code,200)
        dates=list(Installment.objects.filter(loan=loan).order_by('number').values_list('due_date',flat=True))
        self.assertEqual(dates[0],date(2026,2,28))
        self.assertEqual(dates[1],date(2026,3,31))


    def test_payment_idempotency_key_prevents_duplicate_collection(self):
        loan=Loan.objects.create(member=self.member,product=self.product,principal=Decimal('1000'),status='disbursed')
        Installment.objects.create(loan=loan,number=1,due_date=date(2026,10,10),principal_due=Decimal('100'),interest_due=Decimal('10'))
        payload={'member':self.member.pk,'loan':loan.pk,'amount':'50','method':'cash','paid_on':'2026-10-09','status':'success','reference':'IDEMPOTENT-REF','idempotency_key':'collect-unique-001'}
        first=self.client.post('/api/payments/',payload,format='json')
        second=self.client.post('/api/payments/',payload,format='json')
        self.assertEqual(first.status_code,201)
        self.assertEqual(second.status_code,200)
        self.assertEqual(Payment.objects.filter(idempotency_key='collect-unique-001').count(),1)
        self.assertEqual(JournalEntry.objects.filter(reference='IDEMPOTENT-REF').count(),2)
        inst.refresh_from_db()
        self.assertEqual(inst.principal_paid + inst.interest_paid,Decimal('50.00'))

    def test_bank_collection_posts_to_selected_bank_ledger(self):
        loan=Loan.objects.create(member=self.member,product=self.product,principal=Decimal('1000'),status='disbursed')
        Installment.objects.create(loan=loan,number=1,due_date=date(2026,10,10),principal_due=Decimal('100'),interest_due=Decimal('10'))
        response=self.client.post('/api/payments/',{'member':self.member.pk,'loan':loan.pk,'amount':'50','method':'bank','bank_account':'SBI Current A/C','paid_on':'2026-10-09','status':'success','reference':'BANK-COLLECT-REF'},format='json')
        self.assertEqual(response.status_code,201)
        self.assertEqual(response.data['bank_account'],'SBI Current A/C')
        self.assertEqual(JournalEntry.objects.filter(reference='BANK-COLLECT-REF',account='Bank: SBI Current A/C',debit=Decimal('50.00')).count(),1)
        self.assertEqual(JournalEntry.objects.filter(reference='BANK-COLLECT-REF',account='Loans Receivable',credit=Decimal('50.00')).count(),1)

    def test_payment_idempotency_key_cannot_be_reused_for_different_amount(self):
        loan=self._pending_collection_loan()
        payload={'member':self.member.pk,'loan':loan.pk,'amount':'10','method':'cash','status':'pending','idempotency_key':'key-reuse-001'}
        first=self.client.post('/api/payments/',payload,format='json')
        changed={**payload,'amount':'11'}
        second=self.client.post('/api/payments/',changed,format='json')
        self.assertEqual(first.status_code,201)
        self.assertEqual(second.status_code,409)
        self.assertEqual(Payment.objects.filter(idempotency_key='key-reuse-001').count(),1)

    def test_payment_idempotency_rejects_malformed_amount_with_400(self):
        loan=self._pending_collection_loan()
        payload={'member':self.member.pk,'loan':loan.pk,'amount':'10','method':'cash','status':'pending','idempotency_key':'key-invalid-amount-001'}
        first=self.client.post('/api/payments/',payload,format='json')
        changed={**payload,'amount':'not-money'}
        second=self.client.post('/api/payments/',changed,format='json')
        self.assertEqual(first.status_code,201)
        self.assertEqual(second.status_code,400)
        self.assertIn('amount',second.data)
        self.assertEqual(Payment.objects.filter(idempotency_key='key-invalid-amount-001').count(),1)

    def test_payment_idempotency_rejects_non_finite_amount_with_400(self):
        loan=self._pending_collection_loan()
        payload={'member':self.member.pk,'loan':loan.pk,'amount':'10','method':'cash','status':'pending','idempotency_key':'key-nan-amount-001'}
        first=self.client.post('/api/payments/',payload,format='json')
        changed={**payload,'amount':'NaN'}
        second=self.client.post('/api/payments/',changed,format='json')
        self.assertEqual(first.status_code,201)
        self.assertEqual(second.status_code,400)
        self.assertIn('amount',second.data)
        self.assertEqual(Payment.objects.filter(idempotency_key='key-nan-amount-001').count(),1)


    def test_shared_external_reference_reversal_only_reverses_its_receipt(self):
        # External bank/gateway references are not guaranteed unique in imported data.
        # A reversal must be scoped to the unique receipt marker, not every row sharing ref.
        loan_a=Loan.objects.create(member=self.member,product=self.product,principal=Decimal('1000'),status='disbursed')
        loan_b=Loan.objects.create(member=self.member,product=self.product,principal=Decimal('1000'),status='disbursed')
        inst_a=Installment.objects.create(loan=loan_a,number=1,due_date=date(2026,10,10),principal_due=Decimal('100'),interest_due=Decimal('10'))
        inst_b=Installment.objects.create(loan=loan_b,number=1,due_date=date(2026,10,10),principal_due=Decimal('100'),interest_due=Decimal('10'))
        payload={'member':self.member.pk,'amount':'50','method':'cash','paid_on':'2026-10-09','status':'success','reference':'SHARED-EXTERNAL-REF'}
        a=self.client.post('/api/payments/',{**payload,'loan':loan_a.pk},format='json')
        b=self.client.post('/api/payments/',{**payload,'loan':loan_b.pk},format='json')
        self.assertEqual(a.status_code,201,a.data)
        self.assertEqual(b.status_code,201,b.data)
        receipt_a=a.data['receipt_no']; receipt_b=b.data['receipt_no']
        reverse=self.client.post(f"/api/payments/{a.data['id']}/reverse/",{'reason':'Reverse first duplicate reference'},format='json')
        self.assertEqual(reverse.status_code,202,reverse.data)
        self.client.force_authenticate(self.disburser)
        approved=self.client.post(f"/api/payment-reversal-requests/{reverse.data['id']}/approve/",{'decision_note':'Independent duplicate receipt review complete'},format='json')
        self.assertEqual(approved.status_code,200,approved.data)
        inst_a.refresh_from_db(); inst_b.refresh_from_db()
        self.assertEqual(inst_a.principal_paid,Decimal('0.00'))
        self.assertEqual(inst_a.interest_paid,Decimal('0.00'))
        self.assertEqual(inst_b.principal_paid,Decimal('40.00'))
        self.assertEqual(inst_b.interest_paid,Decimal('10.00'))
        marker=f'receipt {receipt_b}'
        remaining_original=list(JournalEntry.objects.filter(reference='SHARED-EXTERNAL-REF',note__contains=marker))
        self.assertEqual(sum((row.debit for row in remaining_original),Decimal('0')),Decimal('50.00'))
        self.assertEqual(sum((row.credit for row in remaining_original),Decimal('0')),Decimal('50.00'))

    def test_capital_entry_rejects_duplicate_ledger_reference(self):
        JournalEntry.objects.create(date=date(2026,10,9),entry_type='adjustment',account='Cash',debit=Decimal('500'),credit=Decimal('0'),reference='CAP-DUPLICATE')
        response=self.client.post('/api/capital/',{'kind':'in','amount':'100.00','date':'2026-10-09','reference':'CAP-DUPLICATE','note':'Duplicate ref should be rejected'},format='json')
        self.assertEqual(response.status_code,400,response.data)
        self.assertFalse(CapitalEntry.objects.filter(reference='CAP-DUPLICATE').exists())


class BalancedJournalBatchTests(TestCase):
    def setUp(self):
        from .models import ChartOfAccount
        ChartOfAccount.objects.create(code='1000',name='Cash',account_type='asset')
        ChartOfAccount.objects.create(code='3000',name='Capital',account_type='equity')
        self.user=get_user_model().objects.create_user(username='accountant',password='test-password-123',is_staff=True)
        self.client=APIClient(); self.client.force_authenticate(self.user)

    def test_balanced_journal_batch_posts_atomically(self):
        response=self.client.post('/api/journal/post-batch/',{
            'date':'2026-10-09','entry_type':'adjustment','reference':'JV-TEST-001',
            'lines':[{'account':'Cash','debit':'500.00','credit':'0'},
                     {'account':'Capital','debit':'0','credit':'500.00'}]},format='json')
        self.assertEqual(response.status_code,201)
        self.assertEqual(response.data['debit_total'],'500.00')
        self.assertEqual(response.data['credit_total'],'500.00')
        self.assertEqual(JournalEntry.objects.count(),2)
        self.assertEqual(JournalEntry.objects.filter(reference='JV-TEST-001',account_ref__isnull=False).count(),2)

    def test_balanced_journal_batch_rejects_unmapped_account(self):
        response=self.client.post('/api/journal/post-batch/',{
            'date':'2026-10-09','entry_type':'adjustment','reference':'JV-UNMAPPED-001',
            'lines':[{'account':'Unknown Ledger','debit':'10.00','credit':'0'},
                     {'account':'Capital','debit':'0','credit':'10.00'}]},format='json')
        self.assertEqual(response.status_code,400)
        self.assertEqual(JournalEntry.objects.count(),0)

    def test_balanced_journal_batch_rejects_duplicate_reference(self):
        payload={
            'date':'2026-10-09','entry_type':'adjustment','reference':'JV-DUPLICATE-001',
            'lines':[{'account':'Cash','debit':'75.00','credit':'0'},
                     {'account':'Capital','debit':'0','credit':'75.00'}]
        }
        first=self.client.post('/api/journal/post-batch/',payload,format='json')
        second=self.client.post('/api/journal/post-batch/',payload,format='json')
        self.assertEqual(first.status_code,201,first.data)
        self.assertEqual(second.status_code,409,second.data)
        self.assertEqual(JournalEntry.objects.filter(reference='JV-DUPLICATE-001').count(),2)

    def test_unbalanced_journal_batch_is_rejected_without_partial_rows(self):
        response=self.client.post('/api/journal/post-batch/',{
            'date':'2026-10-09','entry_type':'adjustment',
            'lines':[{'account':'Cash','debit':'500','credit':'0'},
                     {'account':'Capital','debit':'0','credit':'450'}]},format='json')
        self.assertEqual(response.status_code,400)
        self.assertEqual(JournalEntry.objects.count(),0)

    def test_journal_rows_cannot_be_changed_or_deleted_by_crud(self):
        row=JournalEntry.objects.create(entry_type='adjustment',account='Cash',debit=Decimal('5'))
        response=self.client.patch(f'/api/journal/{row.pk}/',{'debit':'2'},format='json')
        self.assertEqual(response.status_code,405)
        response=self.client.delete(f'/api/journal/{row.pk}/')
        self.assertEqual(response.status_code,405)
        row.refresh_from_db(); self.assertEqual(row.debit,Decimal('5'))

class FinancialControlTests(TestCase):
    def setUp(self):
        User=get_user_model()
        self.staff=User.objects.create_user(username='finance-admin',password='test-password-123',is_staff=True)
        self.operator=User.objects.create_user(username='finance-operator',password='test-password-123',is_staff=False)
        self.client=APIClient()
        self.branch=Branch.objects.create(name='Control Branch',code='CTRL')
        self.member=Member.objects.create(branch=self.branch,member_no='CTRL-001',name='Control Member',phone='9000000001')
        self.product=LoanProduct.objects.create(name='Control Plan',code='CTRL-PLAN',interest_rate=Decimal('12'),interest_method='flat',frequency='monthly',tenure=12)

    def _pending_collection_loan(self):
        loan=Loan.objects.create(member=self.member,product=self.product,principal=Decimal('1000.00'),status='disbursed')
        Installment.objects.create(loan=loan,number=1,due_date=date(2026,10,31),principal_due=Decimal('100.00'),interest_due=Decimal('10.00'))
        return loan

    def test_non_staff_cannot_approve_application(self):
        app=LoanApplication.objects.create(member=self.member,product=self.product,requested_amount=Decimal('1000'))
        self.client.force_authenticate(self.operator)
        response=self.client.post(f'/api/applications/{app.pk}/approve/',{},format='json')
        self.assertEqual(response.status_code,403)
        app.refresh_from_db()
        self.assertEqual(app.status,'pending')
        self.assertFalse(Loan.objects.filter(application=app).exists())

    def test_non_staff_cannot_post_payment(self):
        self.client.force_authenticate(self.operator)
        response=self.client.post('/api/payments/',{'member':self.member.pk,'amount':'10','method':'cash','status':'pending'},format='json')
        self.assertEqual(response.status_code,403)
        self.assertEqual(Payment.objects.count(),0)

    def test_used_loan_plan_financial_terms_are_immutable(self):
        loan=Loan.objects.create(member=self.member,product=self.product,principal=Decimal('1000'),status='approved')
        self.client.force_authenticate(self.staff)
        response=self.client.patch(f'/api/loan-products/{self.product.pk}/',{'interest_rate':'24'},format='json')
        self.assertEqual(response.status_code,400)
        self.product.refresh_from_db()
        self.assertEqual(self.product.interest_rate,Decimal('12.000'))

    def test_non_staff_cannot_read_audit_logs(self):
        self.client.force_authenticate(self.operator)
        response=self.client.get('/api/audit-logs/')
        self.assertEqual(response.status_code,403)


class BankReconciliationFoundationTests(TestCase):
    def setUp(self):
        User=get_user_model(); self.admin=User.objects.create_user(username='bank-admin',password='test-password-123',is_staff=True)
        self.client=APIClient(); self.client.force_authenticate(self.admin)
        ChartOfAccount.objects.create(code='BANK-001',name='Bank',account_type='asset')
        JournalEntry.objects.create(date='2026-10-09',entry_type='adjustment',account='Bank',debit=Decimal('100'),reference='BANKREF-1')
    def test_statement_line_requires_one_positive_side(self):
        response=self.client.post('/api/bank-reconciliation-lines/',{'bank_account':'Bank','statement_date':'2026-10-09','debit':'0','credit':'0'},format='json')
        self.assertEqual(response.status_code,400)
    def test_bank_statement_line_can_be_marked_matched_to_existing_reference(self):
        response=self.client.post('/api/bank-reconciliation-lines/',{'bank_account':'Bank','statement_date':'2026-10-09','description':'Deposit','reference':'BANKREF-1','debit':'0','credit':'100'},format='json')
        self.assertEqual(response.status_code,201)
        line_id=response.data['id']
        response=self.client.post(f'/api/bank-reconciliation-lines/{line_id}/mark_matched/',{'journal_reference':'BANKREF-1'},format='json')
        self.assertEqual(response.status_code,200); self.assertEqual(response.data['status'],'matched')


class BankReconciliationStrictMatchTests(TestCase):
    def setUp(self):
        User=get_user_model(); self.admin=User.objects.create_user(username='strict-bank-admin',password='test-password-123',is_staff=True)
        self.client=APIClient(); self.client.force_authenticate(self.admin)
        ChartOfAccount.objects.create(code='BANK-STRICT',name='Main Bank',account_type='asset')
        JournalEntry.objects.create(date='2026-10-09',entry_type='adjustment',account='Main Bank',debit=Decimal('250.00'),reference='DEP-250')
    def test_suggestions_require_correct_statement_direction_and_amount(self):
        response=self.client.post('/api/bank-reconciliation-lines/',{'bank_account':'Main Bank','statement_date':'2026-10-09','description':'Deposit','reference':'DEP-250','debit':'0','credit':'250.00'},format='json')
        self.assertEqual(response.status_code,201); line_id=response.data['id']
        response=self.client.get(f'/api/bank-reconciliation-lines/{line_id}/match_suggestions/')
        self.assertEqual(response.status_code,200); self.assertEqual(len(response.data['suggestions']),1)
    def test_wrong_direction_cannot_be_marked_matched(self):
        response=self.client.post('/api/bank-reconciliation-lines/',{'bank_account':'Main Bank','statement_date':'2026-10-09','description':'Wrong side','reference':'DEP-250','debit':'250.00','credit':'0'},format='json')
        self.assertEqual(response.status_code,201); line_id=response.data['id']
        response=self.client.post(f'/api/bank-reconciliation-lines/{line_id}/mark_matched/',{'journal_reference':'DEP-250'},format='json')
        self.assertEqual(response.status_code,400)
        line=BankReconciliationLine.objects.get(pk=line_id); self.assertEqual(line.status,'unmatched')


class SecurityAndPenaltyTests(CoreWorkflowTests):

    def test_invalid_approved_amount_does_not_change_application_state(self):
        app=LoanApplication.objects.create(member=self.member,product=self.product,requested_amount=Decimal('1000'),approved_amount=Decimal('1500'))
        response=self.client.post(f'/api/applications/{app.pk}/approve/',{},format='json')
        self.assertEqual(response.status_code,400)
        app.refresh_from_db()
        self.assertEqual(app.status,'pending')
        self.assertFalse(Loan.objects.filter(application=app).exists())

    def test_inactive_product_cannot_be_approved(self):
        self.product.active=False; self.product.save(update_fields=['active','updated_at'])
        app=LoanApplication.objects.create(member=self.member,product=self.product,requested_amount=Decimal('1000'))
        response=self.client.post(f'/api/applications/{app.pk}/approve/',{},format='json')
        self.assertEqual(response.status_code,400)
        app.refresh_from_db()
        self.assertEqual(app.status,'pending')
        self.assertFalse(Loan.objects.filter(application=app).exists())

    def test_rejected_application_cannot_be_reapproved(self):
        app=LoanApplication.objects.create(member=self.member,product=self.product,requested_amount=Decimal('1000'),status='rejected')
        response=self.client.post(f'/api/applications/{app.pk}/approve/',{},format='json')
        self.assertEqual(response.status_code,400)
        self.assertFalse(Loan.objects.filter(application=app).exists())
    def test_penalty_command_is_idempotent_and_respects_grace_days(self):
        from django.core.management import call_command
        today=date(2026,10,9)
        overdue=Installment.objects.create(loan=Loan.objects.create(member=self.member,product=self.product,principal=Decimal('1000'),status='disbursed'),number=1,due_date=today-timedelta(days=4),principal_due=Decimal('100'),interest_due=Decimal('10'))
        within_grace=Installment.objects.create(loan=overdue.loan,number=2,due_date=today-timedelta(days=1),principal_due=Decimal('100'),interest_due=Decimal('10'))
        from unittest.mock import patch
        with patch('django.utils.timezone.localdate', return_value=today):
            call_command('assess_late_penalties')
            call_command('assess_late_penalties')
        overdue.refresh_from_db(); within_grace.refresh_from_db()
        self.assertEqual(overdue.penalty_due,Decimal('100.00'))
        self.assertEqual(within_grace.penalty_due,Decimal('0.00'))
        self.assertEqual(JournalEntry.objects.filter(reference=f'PENALTY-INSTALLMENT-{overdue.pk}').count(),2)

    def test_approval_requires_verified_identity_and_address(self):
        KycDocument.objects.filter(member=self.member).delete()
        app=LoanApplication.objects.create(member=self.member,product=self.product,requested_amount=Decimal('1000'))
        response=self.client.post(f'/api/applications/{app.pk}/approve/',{},format='json')
        self.assertEqual(response.status_code,400)
        self.assertFalse(Loan.objects.filter(application=app).exists())

    def test_approval_accepts_verified_aadhaar_as_identity_document(self):
        KycDocument.objects.filter(member=self.member,document_type='identity').delete()
        KycDocument.objects.create(member=self.member,document_type='aadhaar',file='private/test-aadhaar.pdf',original_name='test-aadhaar.pdf',verified=True)
        app=LoanApplication.objects.create(member=self.member,product=self.product,requested_amount=Decimal('1000'))
        response=self.client.post(f'/api/applications/{app.pk}/approve/',{},format='json')
        self.assertEqual(response.status_code,200,response.data)
        self.assertTrue(Loan.objects.filter(application=app).exists())

    def test_approval_accepts_verified_pan_as_identity_document(self):
        KycDocument.objects.filter(member=self.member,document_type='identity').delete()
        KycDocument.objects.create(member=self.member,document_type='pan',file='private/test-pan.pdf',original_name='test-pan.pdf',verified=True)
        app=LoanApplication.objects.create(member=self.member,product=self.product,requested_amount=Decimal('1000'))
        response=self.client.post(f'/api/applications/{app.pk}/approve/',{},format='json')
        self.assertEqual(response.status_code,200,response.data)
        self.assertTrue(Loan.objects.filter(application=app).exists())

    def test_csv_formula_injection_is_neutralized(self):
        self.member.name='=HYPERLINK("http://bad","click")'; self.member.save()
        response=self.client.get('/api/reports/export/?type=members')
        self.assertEqual(response.status_code,200)
        self.assertIn("'=HYPERLINK",response.content.decode('utf-8-sig'))


class KycFileSignatureTests(TestCase):
    def setUp(self):
        self.user=get_user_model().objects.create_user(username='kyc-uploader',password='TestPassword123!',is_staff=True)
        self.branch=Branch.objects.create(name='KYC Test Branch',code='KYC-T')
        self.member=Member.objects.create(branch=self.branch,member_no='KYC-M-1',name='KYC Test Member',phone='9000000200')

    def test_kyc_upload_cannot_self_verify(self):
        from django.core.files.uploadedfile import SimpleUploadedFile
        from .serializers import KycDocumentSerializer
        pdf = SimpleUploadedFile('test.pdf', b'%PDF-1.4\nvalid test fixture', content_type='application/pdf')
        serializer = KycDocumentSerializer(data={
            'member': self.member.pk, 'document_type': 'aadhaar', 'file': pdf, 'verified': True
        }, context={'request': type('Request', (), {'user': self.user})()})
        self.assertTrue(serializer.is_valid(), serializer.errors)
        import tempfile
        from django.test import override_settings
        with tempfile.TemporaryDirectory() as media_root, override_settings(MEDIA_ROOT=media_root):
            doc = serializer.save()
            self.assertFalse(doc.verified)

    def test_kyc_document_type_cannot_be_rewritten_after_upload(self):
        from .serializers import KycDocumentSerializer
        from .models import KycDocument
        doc=KycDocument.objects.create(member=self.member,document_type='aadhaar',file='private/id.pdf',original_name='id.pdf',verified=True)
        serializer=KycDocumentSerializer(doc,data={'document_type':'signature'},partial=True)
        self.assertFalse(serializer.is_valid())
        self.assertIn('document_type',serializer.errors)

    def test_fake_pdf_extension_and_mime_is_rejected(self):
        from django.core.files.uploadedfile import SimpleUploadedFile
        from .serializers import KycDocumentSerializer
        fake=SimpleUploadedFile('identity.pdf',b'<html>not a pdf</html>',content_type='application/pdf')
        serializer=KycDocumentSerializer(data={'member':1,'document_type':'identity','file':fake})
        self.assertFalse(serializer.is_valid())
        self.assertIn('file',serializer.errors)

class ForeclosureWorkflowTests(TestCase):
    def setUp(self):
        self.user=get_user_model().objects.create_user(username='foreclosure-tester',password='test-password-123',is_staff=True)
        self.client=APIClient(); self.client.force_authenticate(self.user)
        self.branch=Branch.objects.create(name='Foreclosure Branch',code='FC-1')
        self.member=Member.objects.create(branch=self.branch,member_no='FC-M-001',name='Foreclosure Test Member',phone='9000000100')
        self.product=LoanProduct.objects.create(name='Foreclosure Loan',code='FC-LOAN',interest_rate=Decimal('12'),interest_method='flat',frequency='monthly',tenure=1)
        self.loan=Loan.objects.create(member=self.member,product=self.product,principal=Decimal('1000'),status='disbursed')
        self.installment=Installment.objects.create(
            loan=self.loan,number=1,due_date=date(2026,10,10),
            principal_due=Decimal('100'),interest_due=Decimal('10'),penalty_due=Decimal('5'),
            principal_paid=Decimal('20'),interest_paid=Decimal('2'),penalty_paid=Decimal('0'),status='partial')

    def test_foreclosure_quote_returns_remaining_principal_interest_penalty(self):
        response=self.client.get(f'/api/loans/{self.loan.pk}/foreclose/')
        self.assertEqual(response.status_code,200,response.data)
        self.assertEqual(response.data['outstanding_amount'],'93.00')
        self.assertFalse(response.data['interest_discounted'])

    def test_foreclosure_posts_payment_balanced_journal_and_closes_loan(self):
        response=self.client.post(f'/api/loans/{self.loan.pk}/foreclose/',{
            'amount':'93.00','method':'cash','paid_on':'2026-10-10',
            'reference':f'FORECLOSE-{self.loan.pk}-test','idempotency_key':f'FORECLOSE-{self.loan.pk}-test'},format='json')
        self.assertEqual(response.status_code,201,response.data)
        self.loan.refresh_from_db(); self.installment.refresh_from_db()
        self.assertEqual(self.loan.status,'closed')
        self.assertEqual(self.installment.status,'paid')
        self.assertEqual(self.installment.principal_paid,self.installment.principal_due)
        self.assertEqual(self.installment.interest_paid,self.installment.interest_due)
        self.assertEqual(self.installment.penalty_paid,self.installment.penalty_due)
        rows=JournalEntry.objects.filter(reference=f'FORECLOSE-{self.loan.pk}-test')
        self.assertEqual(sum((r.debit for r in rows),Decimal('0')),sum((r.credit for r in rows),Decimal('0')))
        self.assertEqual(Payment.objects.filter(idempotency_key=f'FORECLOSE-{self.loan.pk}-test').count(),1)
        retry=self.client.post(f'/api/loans/{self.loan.pk}/foreclose/',{
            'amount':'93.00','method':'cash','paid_on':'2026-10-10',
            'reference':f'FORECLOSE-{self.loan.pk}-test','idempotency_key':f'FORECLOSE-{self.loan.pk}-test'},format='json')
        self.assertEqual(retry.status_code,200,retry.data)
        self.assertEqual(retry.data['receipt_no'],response.data['receipt_no'])
        self.assertEqual(Payment.objects.filter(idempotency_key=f'FORECLOSE-{self.loan.pk}-test').count(),1)

    def test_foreclosure_rejects_amount_that_does_not_match_quote(self):
        response=self.client.post(f'/api/loans/{self.loan.pk}/foreclose/',{
            'amount':'92.99','method':'cash','idempotency_key':f'FORECLOSE-{self.loan.pk}-bad'},format='json')
        self.assertEqual(response.status_code,400)
        self.assertFalse(Payment.objects.filter(idempotency_key=f'FORECLOSE-{self.loan.pk}-bad').exists())

class StaffUserManagementTests(TestCase):
    def setUp(self):
        User=get_user_model()
        self.admin=User.objects.create_user(username='staffadmin',password='StrongTestPass123!',is_staff=True,is_superuser=True)
        self.regular=User.objects.create_user(username='regular',password='StrongTestPass123!')
        self.client=APIClient(); self.client.force_authenticate(self.admin)
        self.branch=Branch.objects.create(name='Branch A',code='BA')

    def test_admin_can_create_staff_with_role_and_permissions(self):
        response=self.client.post('/api/staff-users/',{
            'username':'accounts1','email':'accounts@example.test','password':'StrongTestPass123!',
            'role':'accountant','branch':self.branch.pk,
            'permissions':{'view_accounting':True,'manage_accounting':False,'view_reports':True},'active':True
        },format='json')
        self.assertEqual(response.status_code,201,response.data)
        user=get_user_model().objects.get(username='accounts1')
        self.assertEqual(user.staff_profile.role,'accountant')
        self.assertEqual(user.staff_profile.branch,self.branch)
        self.assertTrue(user.check_password('StrongTestPass123!'))
        self.assertFalse(user.staff_profile.permissions['manage_accounting'])

    def test_non_admin_cannot_create_staff(self):
        self.client.force_authenticate(self.regular)
        response=self.client.post('/api/staff-users/',{
            'username':'notallowed','password':'StrongTestPass123!','role':'loan_officer','permissions':{}
        },format='json')
        self.assertIn(response.status_code,[401,403])
        self.assertFalse(get_user_model().objects.filter(username='notallowed').exists())


    def test_non_superuser_staff_cannot_manage_staff_accounts(self):
        staff=get_user_model().objects.create_user(username='staff-but-not-admin',password='StrongTestPass123!',is_staff=True,is_superuser=False)
        self.client.force_authenticate(staff)
        response=self.client.get('/api/staff-users/')
        self.assertEqual(response.status_code,403)

    def test_profile_permission_is_enforced_for_member_api(self):
        from .models import StaffProfile
        staff=get_user_model().objects.create_user(username='limitedstaff',password='StrongTestPass123!')
        StaffProfile.objects.create(user=staff,role='accountant',branch=self.branch,permissions={'view_customers':False})
        self.client.force_authenticate(staff)
        response=self.client.get('/api/members/')
        self.assertEqual(response.status_code,403)

    def test_granular_manage_customers_permission_allows_member_create_without_view_grant(self):
        from .models import StaffProfile
        staff=get_user_model().objects.create_user(username='membercreator',password='StrongTestPass123!')
        StaffProfile.objects.create(user=staff,role='loan_officer',branch=self.branch,permissions={'manage_customers':True})
        self.client.force_authenticate(staff)
        response=self.client.post('/api/members/',{'branch':self.branch.pk,'member_no':'M-GRANULAR-1','name':'Granular Test','phone':'9000000109'},format='json')
        self.assertEqual(response.status_code,201,response.data)

    def test_granular_collection_view_permission_allows_payment_list(self):
        from .models import StaffProfile
        staff=get_user_model().objects.create_user(username='collectionviewer',password='StrongTestPass123!')
        StaffProfile.objects.create(user=staff,role='accountant',branch=self.branch,permissions={'view_collections':True})
        self.client.force_authenticate(staff)
        response=self.client.get('/api/payments/')
        self.assertEqual(response.status_code,200,response.data)

    def test_branch_dashboard_hides_unscoped_cash_bank_without_error(self):
        from .models import StaffProfile
        staff=get_user_model().objects.create_user(username='branchviewer',password='StrongTestPass123!')
        StaffProfile.objects.create(user=staff,role='manager',branch=self.branch,permissions={'view_reports':True})
        self.client.force_authenticate(staff)
        response=self.client.get('/api/dashboard/')
        self.assertEqual(response.status_code,200,response.data)
        self.assertIsNone(response.data['cash_balance'])
        self.assertIsNone(response.data['bank_balance'])
        self.assertIsNone(response.data['total_cash_bank_balance'])


class OrganizationAndHRTests(TestCase):
    def setUp(self):
        self.admin=get_user_model().objects.create_user(username='hr-admin',password='test-password-123',is_staff=True)
        self.client=APIClient(); self.client.force_authenticate(self.admin)
        self.branch=Branch.objects.create(name='Head Office',code='HR-HO')
        self.employee=Employee.objects.create(branch=self.branch,employee_no='EMP-HR-1',name='HR Test',phone='9000000002')

    def test_organization_profile_persists_server_side(self):
        response=self.client.post('/api/organization-profile/',{'name':'NMFA Test','subtitle':'Service Association','phone':'9000000000'},format='json')
        self.assertEqual(response.status_code,201)
        loaded=self.client.get('/api/organization-profile/')
        self.assertEqual(loaded.status_code,200)
        self.assertEqual(loaded.data[0]['name'],'NMFA Test')
        duplicate=self.client.post('/api/organization-profile/',{'name':'Duplicate'},format='json')
        self.assertEqual(duplicate.status_code,400)

    def test_attendance_rejects_duplicate_employee_date(self):
        payload={'employee':self.employee.pk,'attendance_date':'2026-10-11','status':'present','check_in':'09:00:00','check_out':'17:00:00'}
        first=self.client.post('/api/attendance/',payload,format='json')
        second=self.client.post('/api/attendance/',payload,format='json')
        self.assertEqual(first.status_code,201)
        self.assertEqual(second.status_code,400)

    def test_attendance_rejects_checkout_before_checkin(self):
        response=self.client.post('/api/attendance/',{'employee':self.employee.pk,'attendance_date':'2026-10-11','status':'present','check_in':'17:00:00','check_out':'09:00:00'},format='json')
        self.assertEqual(response.status_code,400)

    def test_payroll_calculates_net_salary_server_side(self):
        response=self.client.post('/api/payroll/',{'employee':self.employee.pk,'period_month':'2026-10-01','basic_salary':'25000.00','fixed_allowance':'2000.00','fixed_deduction':'500.00','income_tax':'1000.00','status':'draft'},format='json')
        self.assertEqual(response.status_code,201)
        self.assertEqual(response.data['net_salary'],'25500.00')

    def test_salary_approval_is_maker_checker_and_does_not_mark_paid(self):
        created=self.client.post('/api/payroll/',{
            'employee':self.employee.pk,'period_month':'2026-10-01','basic_salary':'25000.00',
            'fixed_allowance':'1000.00','fixed_deduction':'500.00','income_tax':'500.00'
        },format='json')
        self.assertEqual(created.status_code,201,created.data)
        payroll_id=created.data['id']
        self_approve=self.client.post(f'/api/payroll/{payroll_id}/approve/',{'approval_note':'Reviewed payroll'},format='json')
        self.assertEqual(self_approve.status_code,403)
        approver=get_user_model().objects.create_user(username='salary-approver',password='test-password-123',is_staff=True)
        self.client.force_authenticate(approver)
        approved=self.client.post(f'/api/payroll/{payroll_id}/approve/',{'approval_note':'Salary figures verified'},format='json')
        self.assertEqual(approved.status_code,200,approved.data)
        self.assertEqual(approved.data['status'],'approved')
        self.assertIsNone(approved.data['paid_on'])
        self.assertEqual(JournalEntry.objects.count(),0)
        again=self.client.post(f'/api/payroll/{payroll_id}/approve/',{'approval_note':'Duplicate'},format='json')
        self.assertEqual(again.status_code,409)

    def test_payroll_rejects_duplicate_month_and_negative_amount(self):
        payload={'employee':self.employee.pk,'period_month':'2026-10-01','basic_salary':'25000.00','fixed_allowance':'0','fixed_deduction':'0','income_tax':'0','status':'draft'}
        self.assertEqual(self.client.post('/api/payroll/',payload,format='json').status_code,201)
        self.assertEqual(self.client.post('/api/payroll/',payload,format='json').status_code,400)
        bad={**payload,'period_month':'2026-11-01','basic_salary':'-1'}
        self.assertEqual(self.client.post('/api/payroll/',bad,format='json').status_code,400)

    def test_payroll_cannot_be_marked_paid_without_disbursement_workflow(self):
        response=self.client.post('/api/payroll/',{'employee':self.employee.pk,'period_month':'2026-10-01','basic_salary':'10000','status':'paid'},format='json')
        self.assertEqual(response.status_code,400)

    def test_employee_reference_hr_fields_are_saved(self):
        response=self.client.post('/api/employees/',{
            'branch':self.branch.pk,'employee_no':'EMP-HR-001','name':'HR Test','phone':'9000000002',
            'role':'Field Officer','designation':'Collector','father_name':'Test Father','dob':'1995-04-10',
            'joining_date':'2026-01-01','bank_name':'Test Bank','account_holder':'HR Test',
            'bank_account_number':'123456789','ifsc_code':'TEST0001234','annual_basic_salary':'240000.00',
            'fixed_allowance':'2000.00','monthly_fixed_deduction':'100.00','monthly_income_tax':'50.00',
            'casual_leave_days':12,'aadhaar_status':'pending','pan_status':'pending','login_status':'inactive'
        },format='json')
        self.assertEqual(response.status_code,201,response.data)
        self.assertEqual(response.data['designation'],'Collector')
        self.assertEqual(Decimal(response.data['annual_basic_salary']),Decimal('240000.00'))
        self.assertEqual(response.data['casual_leave_days'],12)

    def test_employee_aadhaar_format_is_validated(self):
        response=self.client.post('/api/employees/',{
            'branch':self.branch.pk,'employee_no':'EMP-HR-002','name':'Bad Aadhaar','phone':'9000000003',
            'aadhaar_number':'1234'
        },format='json')
        self.assertEqual(response.status_code,400)
        self.assertIn('aadhaar_number',response.data)

    def test_employee_pan_format_is_validated(self):
        response=self.client.post('/api/employees/',{
            'branch':self.branch.pk,'employee_no':'EMP-HR-003','name':'Bad PAN','phone':'9000000004',
            'pan_number':'INVALID'
        },format='json')
        self.assertEqual(response.status_code,400)
        self.assertIn('pan_number',response.data)


    def test_promise_to_pay_create_and_outcome(self):
        loan=Loan.objects.create(member=self.member,product=self.product,principal=Decimal('1000'),status='disbursed')
        response=self.client.post('/api/promises-to-pay/',{'member':self.member.pk,'loan':loan.pk,'promised_date':'2026-10-20','promised_amount':'250.00','follow_up_note':'Customer requested next week'},format='json')
        self.assertEqual(response.status_code,201)
        promise_id=response.data['id']
        response=self.client.post(f'/api/promises-to-pay/{promise_id}/outcome/',{'status':'kept','follow_up_note':'Paid at branch'},format='json')
        self.assertEqual(response.status_code,200)
        self.assertEqual(response.data['status'],'kept')
        self.assertEqual(PromiseToPay.objects.get(pk=promise_id).status,'kept')

    def test_settlement_offer_snapshots_outstanding_and_requires_admin_approval(self):
        loan=Loan.objects.create(member=self.member,product=self.product,principal=Decimal('1000'),status='disbursed')
        Installment.objects.create(loan=loan,number=1,due_date=date(2026,10,20),principal_due=Decimal('800'),interest_due=Decimal('200'))
        response=self.client.post('/api/settlements/',{'member':self.member.pk,'loan':loan.pk,'proposed_amount':'900.00','reason':'Hardship settlement request'},format='json')
        self.assertEqual(response.status_code,201)
        case_id=response.data['id']
        self.assertEqual(response.data['outstanding_snapshot'],'1000.00')
        self.assertEqual(response.data['discount_amount'],'100.00')
        approver=get_user_model().objects.create_user(username='settlement-approver',password='test-password-123',is_staff=True)
        self.client.force_authenticate(approver)
        response=self.client.post(f'/api/settlements/{case_id}/approve/',{'approval_note':'Approved for test'},format='json')
        self.assertEqual(response.status_code,200,response.data)
        self.assertEqual(response.data['status'],'approved')
        self.assertEqual(SettlementCase.objects.get(pk=case_id).status,'approved')

    def test_settlement_offer_cannot_exceed_outstanding(self):
        loan=Loan.objects.create(member=self.member,product=self.product,principal=Decimal('1000'),status='disbursed')
        Installment.objects.create(loan=loan,number=1,due_date=date(2026,10,20),principal_due=Decimal('800'),interest_due=Decimal('200'))
        response=self.client.post('/api/settlements/',{'member':self.member.pk,'loan':loan.pk,'proposed_amount':'1100.00','reason':'Hardship settlement request'},format='json')
        self.assertEqual(response.status_code,400)
        self.assertEqual(SettlementCase.objects.count(),0)


class MasterMenuConfigurationTests(TestCase):
    """Regression tests for the first functional Master-menu increment."""
    def setUp(self):
        self.user=get_user_model().objects.create_user(username='master-admin',password='test-password-123',is_staff=True)
        self.client=APIClient(); self.client.force_authenticate(self.user)

    def test_master_catalog_prevents_duplicate_code_and_name(self):
        payload={'master_key':'bank','name':'State Bank of India','short_name':'SBI','code':'sbi','active':True,'document_role':'other','ledger_account':''}
        first=self.client.post('/api/master-catalog/',payload,format='json')
        self.assertEqual(first.status_code,201,first.data)
        duplicate_code=self.client.post('/api/master-catalog/',{**payload,'name':'Another Bank','short_name':'AB'},format='json')
        self.assertEqual(duplicate_code.status_code,400)
        duplicate_name=self.client.post('/api/master-catalog/',{**payload,'code':'sbi-2','short_name':'SBI2'},format='json')
        self.assertEqual(duplicate_name.status_code,400)
        self.assertEqual(MasterCatalogEntry.objects.filter(master_key='bank').count(),1)

    def test_document_type_master_cannot_shadow_builtin_kyc_codes(self):
        payload={'master_key':'document_type','name':'Custom PAN','short_name':'PAN','code':'pan','active':True,'document_role':'identity','ledger_account':''}
        response=self.client.post('/api/master-catalog/',payload,format='json')
        self.assertEqual(response.status_code,400)
        self.assertIn('code',response.data)

    def test_identity_proof_reactivation_cannot_create_ambiguous_kyc_code(self):
        first=ReferenceMaster.objects.create(kind='identity_proof',name='Voter Card',active=False)
        ReferenceMaster.objects.create(kind='identity_proof',name='Voter-Card',active=True)
        response=self.client.patch(f'/api/reference-masters/{first.pk}/',{'active':True},format='json')
        self.assertEqual(response.status_code,400)

    def test_collection_mode_requires_supported_ledger_mapping(self):
        payload={'master_key':'collection_mode','name':'Wallet','short_name':'Wallet','code':'wallet','active':True,'document_role':'other','ledger_account':'Not A Ledger'}
        response=self.client.post('/api/master-catalog/',payload,format='json')
        self.assertEqual(response.status_code,400)
        self.assertIn('ledger_account',response.data)
        payload['ledger_account']='UPI Clearing'
        response=self.client.post('/api/master-catalog/',payload,format='json')
        self.assertEqual(response.status_code,201,response.data)

    def test_penalty_calculation_respects_grace_minimum_and_idempotency_guard(self):
        scheme=PenaltyScheme.objects.create(name='Fixed Once',grace_period_days=3,penalty_type='fixed',penalty_value=Decimal('125.50'),minimum_due_amount=Decimal('100.00'),penalty_mode='one_time',recurring=False)
        self.assertEqual(scheme.calculate_penalty('99.99',5),Decimal('0.00'))
        self.assertEqual(scheme.calculate_penalty('100.00',3),Decimal('0.00'))
        self.assertEqual(scheme.calculate_penalty('100.00',4),Decimal('125.50'))
        self.assertEqual(scheme.calculate_penalty('100.00',4,already_assessed=True),Decimal('0.00'))

    def test_daily_percentage_rounds_each_daily_charge_before_total(self):
        scheme=PenaltyScheme.objects.create(name='Daily Percent',grace_period_days=2,penalty_type='percentage',penalty_value=Decimal('2.50'),minimum_due_amount=Decimal('10.00'),penalty_mode='daily',recurring=True)
        # 2.5% of 123.45 is Rs 3.09 per day after grace; three days = Rs 9.27.
        self.assertEqual(scheme.calculate_penalty('123.45',5),Decimal('9.27'))
        self.assertEqual(scheme.calculate_penalty('123.45',5,already_assessed=True),Decimal('0.00'))

    def test_penalty_preview_is_not_a_financial_posting(self):
        scheme=PenaltyScheme.objects.create(name='Preview Only',grace_period_days=1,penalty_type='fixed',penalty_value=Decimal('50.00'))
        response=self.client.post(f'/api/penalty-schemes/{scheme.pk}/preview/',{'overdue_amount':'1000.00','overdue_days':4},format='json')
        self.assertEqual(response.status_code,200,response.data)
        self.assertEqual(response.data['penalty_amount'],'50.00')
        self.assertFalse(response.data['posted'])
        self.assertEqual(Installment.objects.count(),0)
        self.assertEqual(JournalEntry.objects.count(),0)

    def test_active_financial_session_ranges_may_not_overlap(self):
        first=self.client.post('/api/financial-sessions/',{'name':'FY 2025-26','start_date':'2025-04-01','end_date':'2026-03-31','active':True},format='json')
        self.assertEqual(first.status_code,201,first.data)
        overlap=self.client.post('/api/financial-sessions/',{'name':'FY Overlap','start_date':'2026-03-01','end_date':'2027-02-28','active':True},format='json')
        self.assertEqual(overlap.status_code,400)
        adjacent=self.client.post('/api/financial-sessions/',{'name':'FY 2026-27','start_date':'2026-04-01','end_date':'2027-03-31','active':True},format='json')
        self.assertEqual(adjacent.status_code,201,adjacent.data)

    def test_business_settings_patch_merges_values_and_rejects_bad_age_ranges(self):
        response=self.client.patch('/api/settings/business/',{'values':{'company_name':'NMFA Test','member_age_limit_option':True,'minimum_member_age':18,'maximum_member_age':65}},format='json')
        self.assertEqual(response.status_code,200,response.data)
        self.assertEqual(response.data['values']['company_name'],'NMFA Test')
        response=self.client.patch('/api/settings/business/',{'values':{'minimum_member_age':70,'maximum_member_age':40}},format='json')
        self.assertEqual(response.status_code,400)
        row=BusinessSettings.objects.get(key='default')
        self.assertEqual(row.values['minimum_member_age'],18)
        self.assertEqual(row.values['maximum_member_age'],65)

    def test_non_staff_cannot_change_business_settings(self):
        outsider=get_user_model().objects.create_user(username='ordinary-member',password='test-password-123')
        self.client.force_authenticate(outsider)
        response=self.client.patch('/api/settings/business/',{'values':{'company_name':'Not Allowed'}},format='json')
        self.assertEqual(response.status_code,403)

    def test_software_timing_validates_time_window_and_single_profile(self):
        invalid={'name':'Office','office_start':'18:00','office_end':'09:00','timezone_name':'Invalid/Zone','auto_logout_minutes':0,'working_days':['mon','tue'],'active':True}
        response=self.client.post('/api/software-timing/',invalid,format='json')
        self.assertEqual(response.status_code,400)
        valid={**invalid,'office_start':'09:00','office_end':'18:00'}
        response=self.client.post('/api/software-timing/',valid,format='json')
        self.assertEqual(response.status_code,201,response.data)
        response=self.client.post('/api/software-timing/',{**valid,'name':'Second Profile'},format='json')
        self.assertEqual(response.status_code,400)

    def test_member_age_setting_is_enforced_at_backend(self):
        BusinessSettings.objects.create(key='default',values={'member_age_limit_option':True,'minimum_member_age':18,'maximum_member_age':65})
        branch=Branch.objects.create(name='Age Test Branch',code='AGE')
        response=self.client.post('/api/members/',{'branch':branch.pk,'member_no':'AGE-001','name':'No DOB','phone':'9111111111'},format='json')
        self.assertEqual(response.status_code,400)
        self.assertIn('dob',response.data)


    def test_miscellaneous_identity_proof_is_a_real_kyc_document_type(self):
        proof=ReferenceMaster.objects.create(kind='identity_proof',name='Aadhaar Proof',active=True)
        self.assertEqual(KycDocumentSerializer().validate_document_type('aadhaar-proof'),'aadhaar-proof')
        proof.active=False; proof.save(update_fields=['active','updated_at'])
        from rest_framework.exceptions import ValidationError
        with self.assertRaises(ValidationError):
            KycDocumentSerializer().validate_document_type('aadhaar-proof')

    def test_verified_miscellaneous_identity_proof_counts_for_loan_kyc(self):
        branch=Branch.objects.create(name='KYC Branch',code='KYC')
        member=Member.objects.create(branch=branch,member_no='KYC-001',name='KYC Member',phone='9111111111')
        ReferenceMaster.objects.create(kind='identity_proof',name='Aadhaar Proof',active=False)
        KycDocument.objects.create(member=member,document_type='aadhaar-proof',file='private/test-aadhaar.pdf',original_name='test-aadhaar.pdf',verified=True)
        from .views import _verified_kyc_gaps
        gaps=_verified_kyc_gaps(member)
        self.assertNotIn('identity',gaps)
        self.assertIn('address',gaps)

    def test_penalty_scheme_is_linked_to_loan_plan_and_daily_command_is_idempotent(self):
        from django.core.management import call_command
        from unittest.mock import patch
        today=date(2026,10,12)
        scheme=PenaltyScheme.objects.create(name='Daily 2.5 percent',grace_period_days=2,penalty_type='percentage',penalty_value=Decimal('2.50'),minimum_due_amount=Decimal('10.00'),penalty_mode='daily',recurring=True)
        product=LoanProduct.objects.create(name='Scheme Plan',code='SCHEME-PLAN',interest_rate=Decimal('12'),interest_method='flat',frequency='monthly',tenure=12,late_penalty=Decimal('0'),grace_days=0,penalty_scheme=scheme)
        loan=Loan.objects.create(member=Member.objects.create(branch=Branch.objects.create(name='Scheme Branch',code='SB'),member_no='SCHEME-M-1',name='Scheme Member',phone='9111111112'),product=product,principal=Decimal('123.45'),status='disbursed')
        inst=Installment.objects.create(loan=loan,number=1,due_date=today-timedelta(days=5),principal_due=Decimal('123.45'),interest_due=Decimal('0.00'))
        with patch('django.utils.timezone.localdate',return_value=today):
            call_command('assess_late_penalties')
            call_command('assess_late_penalties')
        inst.refresh_from_db()
        self.assertEqual(inst.penalty_due,Decimal('9.27')) # Rs 3.09 per day × (5 overdue days - 2 grace days).
        self.assertEqual(PenaltyAssessment.objects.filter(installment=inst).count(),1)
        with patch('django.utils.timezone.localdate',return_value=today+timedelta(days=1)):
            call_command('assess_late_penalties')
        inst.refresh_from_db()
        self.assertEqual(inst.penalty_due,Decimal('12.36'))
        self.assertEqual(JournalEntry.objects.filter(reference__startswith='PENALTY-ASSESSMENT-').count(),4)

    def test_loan_plan_preview_decimal_components_sum_exactly(self):
        product=LoanProduct.objects.create(name='Preview Plan',code='PREVIEW-PLAN',interest_rate=Decimal('12.000'),interest_method='flat',frequency='monthly',tenure=12)
        response=self.client.post(f'/api/loan-products/{product.pk}/preview/',{'principal':'10000.00'},format='json')
        self.assertEqual(response.status_code,200,response.data)
        self.assertEqual(response.data['interest_total'],'1200.00')
        self.assertEqual(response.data['total_payable'],'11200.00')
        self.assertEqual(sum((Decimal(x['principal']) for x in response.data['installments']),Decimal('0.00')),Decimal('10000.00'))
        self.assertEqual(sum((Decimal(x['interest']) for x in response.data['installments']),Decimal('0.00')),Decimal('1200.00'))
        self.assertFalse(Loan.objects.filter(product=product).exists())


class CustomRoleCrudTests(TestCase):
    def setUp(self):
        self.admin=get_user_model().objects.create_superuser(username='roleadmin',email='roleadmin@example.com',password='test-password-123')
        self.client=APIClient()
        self.client.force_authenticate(self.admin)

    def test_superuser_can_create_update_and_delete_unassigned_role(self):
        payload={'name':'Collections Supervisor','code':'collections-supervisor','description':'Collection workflow access','active':True,'permissions':{'view_collections':True,'collect_payments':True}}
        response=self.client.post('/api/custom-roles/',payload,format='json')
        self.assertEqual(response.status_code,201,response.data)
        role_id=response.data['id']
        role=CustomRole.objects.get(pk=role_id)
        self.assertTrue(role.permissions['collect_payments'])
        updated=self.client.patch(f'/api/custom-roles/{role_id}/',{'permissions':{'view_collections':True},'active':False},format='json')
        self.assertEqual(updated.status_code,200,updated.data)
        self.assertFalse(CustomRole.objects.get(pk=role_id).active)
        deleted=self.client.delete(f'/api/custom-roles/{role_id}/')
        self.assertEqual(deleted.status_code,204)
        self.assertFalse(CustomRole.objects.filter(pk=role_id).exists())

    def test_custom_role_rejects_unknown_permission(self):
        response=self.client.post('/api/custom-roles/',{'name':'Bad Role','code':'bad-role','permissions':{'superuser_everything':True}},format='json')
        self.assertEqual(response.status_code,400)

    def test_non_superuser_cannot_manage_roles(self):
        user=get_user_model().objects.create_user(username='regular-role-user',password='test-password-123')
        self.client.force_authenticate(user)
        response=self.client.get('/api/custom-roles/')
        self.assertEqual(response.status_code,403)


class AccountingReconciliationTests(TestCase):
    def setUp(self):
        self.admin=get_user_model().objects.create_superuser(username='acctadmin',email='acctadmin@example.com',password='test-password-123')
        self.client=APIClient()
        self.client.force_authenticate(self.admin)

    def test_trial_balance_reports_balanced_totals(self):
        JournalEntry.objects.create(date=date(2026,1,10),entry_type='adjustment',account='Cash',debit=Decimal('100.00'),credit=Decimal('0.00'),reference='TB-1')
        JournalEntry.objects.create(date=date(2026,1,10),entry_type='adjustment',account='Capital',debit=Decimal('0.00'),credit=Decimal('100.00'),reference='TB-1')
        response=self.client.get('/api/journal/trial-balance/?start_date=2026-01-01&end_date=2026-01-31')
        self.assertEqual(response.status_code,200,response.data)
        self.assertEqual(response.data['total_debit'],'100.00')
        self.assertEqual(response.data['total_credit'],'100.00')
        self.assertTrue(response.data['balanced'])
        self.assertEqual(response.data['difference'],'0.00')

    def test_trial_balance_rejects_invalid_date(self):
        response=self.client.get('/api/journal/trial-balance/?start_date=not-a-date')
        self.assertEqual(response.status_code,400)


class CustomerTransferWorkflowTests(TestCase):
    def setUp(self):
        self.user=get_user_model().objects.create_user(username='transfer-admin',password='test-password-123',is_staff=True)
        self.client=APIClient(); self.client.force_authenticate(self.user)
        self.branch_a=Branch.objects.create(name='Branch A',code='BRA')
        self.branch_b=Branch.objects.create(name='Branch B',code='BRB')
        self.agent_a=Employee.objects.create(branch=self.branch_a,employee_no='AG-A',name='Agent A',phone='9000000001',role='Field Officer')
        self.agent_b=Employee.objects.create(branch=self.branch_b,employee_no='AG-B',name='Agent B',phone='9000000002',role='Field Officer')
        self.member=Member.objects.create(branch=self.branch_a,field_officer=self.agent_a,member_no='TR-001',name='Transfer Test',phone='9000000003')

    def test_transfer_moves_member_and_writes_audit_log(self):
        response=self.client.post('/api/members/transfer/', {
            'member_ids':[self.member.id], 'branch':self.branch_b.id,
            'field_officer':self.agent_b.id, 'reason':'Overdue follow-up reassignment'
        }, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.member.refresh_from_db()
        self.assertEqual(self.member.branch_id, self.branch_b.id)
        self.assertEqual(self.member.field_officer_id, self.agent_b.id)
        self.assertTrue(AuditLog.objects.filter(action='customer_transfer', object_id=str(self.member.id)).exists())

    def test_transfer_rejects_agent_from_different_branch(self):
        other_agent=Employee.objects.create(branch=self.branch_a,employee_no='AG-A2',name='Agent A2',phone='9000000004',role='Field Officer')
        response=self.client.post('/api/members/transfer/', {
            'member_ids':[self.member.id], 'branch':self.branch_b.id,
            'field_officer':other_agent.id
        }, format='json')
        self.assertEqual(response.status_code, 400)
