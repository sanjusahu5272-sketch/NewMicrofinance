import datetime
from django.conf import settings
from django.db import models
from django.utils import timezone

class TimeStamped(models.Model):
    created_at=models.DateTimeField(auto_now_add=True)
    updated_at=models.DateTimeField(auto_now=True)
    class Meta: abstract=True

class Branch(TimeStamped):
    name=models.CharField(max_length=120)
    code=models.CharField(max_length=30,unique=True)
    address=models.TextField(blank=True)
    phone=models.CharField(max_length=20,blank=True)
    city=models.CharField(max_length=100,blank=True,default='')
    state=models.CharField(max_length=100,blank=True,default='')
    opening_date=models.DateField(null=True,blank=True)
    active=models.BooleanField(default=True)
    def __str__(self): return f'{self.code} - {self.name}'

class Area(TimeStamped):
    branch=models.ForeignKey(Branch,on_delete=models.PROTECT,related_name='areas')
    name=models.CharField(max_length=120); code=models.CharField(max_length=30)
    active=models.BooleanField(default=True)
    class Meta: unique_together=[('branch','code')]

class Centre(TimeStamped):
    area=models.ForeignKey(Area,on_delete=models.PROTECT,related_name='centres')
    code=models.CharField(max_length=30,blank=True,default='')
    name=models.CharField(max_length=120); meeting_day=models.CharField(max_length=20,blank=True)
    active=models.BooleanField(default=True)

class Group(TimeStamped):
    centre=models.ForeignKey(Centre,on_delete=models.PROTECT,related_name='groups')
    name=models.CharField(max_length=120); code=models.CharField(max_length=30)
    city_village=models.CharField(max_length=120,blank=True,default='')
    center_leader=models.CharField(max_length=160,blank=True,default='')
    active=models.BooleanField(default=True)
    class Meta: unique_together=[('centre','code')]

class Employee(TimeStamped):
    branch=models.ForeignKey(Branch,on_delete=models.PROTECT,related_name='employees')
    employee_no=models.CharField(max_length=40,unique=True); name=models.CharField(max_length=160)
    phone=models.CharField(max_length=20); role=models.CharField(max_length=80,default='Field Officer')
    # HR fields mapped from the reference employee form. Sensitive identity fields
    # are stored only for authorized internal use; this is not an Aadhaar/PAN verification.
    alias=models.CharField(max_length=100,blank=True)
    father_name=models.CharField(max_length=160,blank=True)
    dob=models.DateField(null=True,blank=True)
    email=models.EmailField(blank=True)
    alternate_phone=models.CharField(max_length=20,blank=True)
    designation=models.CharField(max_length=100,blank=True)
    address=models.TextField(blank=True)
    city=models.CharField(max_length=100,blank=True)
    state=models.CharField(max_length=100,blank=True)
    pin_code=models.CharField(max_length=10,blank=True)
    joining_date=models.DateField(null=True,blank=True)
    last_experience_years=models.DecimalField(max_digits=5,decimal_places=2,default=0)
    bank_name=models.CharField(max_length=120,blank=True)
    bank_branch=models.CharField(max_length=120,blank=True)
    account_holder=models.CharField(max_length=160,blank=True)
    bank_account_number=models.CharField(max_length=40,blank=True)
    ifsc_code=models.CharField(max_length=15,blank=True)
    aadhaar_number=models.CharField(max_length=12,blank=True)
    pan_number=models.CharField(max_length=10,blank=True)
    aadhaar_status=models.CharField(max_length=20,default='pending')
    pan_status=models.CharField(max_length=20,default='pending')
    login_status=models.CharField(max_length=20,default='inactive')
    annual_basic_salary=models.DecimalField(max_digits=14,decimal_places=2,default=0)
    fixed_allowance=models.DecimalField(max_digits=14,decimal_places=2,default=0)
    monthly_fixed_deduction=models.DecimalField(max_digits=14,decimal_places=2,default=0)
    monthly_income_tax=models.DecimalField(max_digits=14,decimal_places=2,default=0)
    sick_leave_days=models.PositiveSmallIntegerField(default=0)
    privilege_leave_days=models.PositiveSmallIntegerField(default=0)
    mandatory_leave_days=models.PositiveSmallIntegerField(default=0)
    casual_leave_days=models.PositiveSmallIntegerField(default=0)
    paternity_leave_days=models.PositiveSmallIntegerField(default=0)
    maternity_leave_days=models.PositiveSmallIntegerField(default=0)
    extraordinary_leave_days=models.PositiveSmallIntegerField(default=0)
    active=models.BooleanField(default=True)



class OrganizationProfile(TimeStamped):
    """Organization-wide print and UI branding, managed by an administrator."""
    name=models.CharField(max_length=180,default='NEW MICROFINANCE')
    subtitle=models.CharField(max_length=180,default='SERVICE ASSOCIATION',blank=True)
    address=models.TextField(blank=True)
    phone=models.CharField(max_length=30,blank=True)
    email=models.EmailField(blank=True)
    website=models.URLField(blank=True)
    registration_no=models.CharField(max_length=100,blank=True)
    logo_data=models.TextField(blank=True,help_text='Validated data URL for a small logo; do not store customer documents here.')
    class Meta: ordering=['id']
    def __str__(self): return self.name

class AttendanceRecord(TimeStamped):
    STATUS=[('present','Present'),('absent','Absent'),('leave','Leave'),('half_day','Half day'),('holiday','Holiday')]
    employee=models.ForeignKey(Employee,on_delete=models.PROTECT,related_name='attendance_records')
    attendance_date=models.DateField()
    status=models.CharField(max_length=20,choices=STATUS,default='present')
    check_in=models.TimeField(null=True,blank=True)
    check_out=models.TimeField(null=True,blank=True)
    note=models.CharField(max_length=255,blank=True)
    created_by=models.ForeignKey(settings.AUTH_USER_MODEL,on_delete=models.PROTECT,null=True,blank=True)
    class Meta:
        ordering=['-attendance_date','employee__name']
        constraints=[models.UniqueConstraint(fields=['employee','attendance_date'],name='uniq_employee_attendance_date')]

class PayrollRecord(TimeStamped):
    STATUS=[('draft','Draft'),('approved','Approved'),('rejected','Rejected'),('paid','Paid'),('cancelled','Cancelled')]
    employee=models.ForeignKey(Employee,on_delete=models.PROTECT,related_name='payroll_records')
    period_month=models.DateField(help_text='Use the first calendar day of the payroll month.')
    basic_salary=models.DecimalField(max_digits=14,decimal_places=2,default=0)
    fixed_allowance=models.DecimalField(max_digits=14,decimal_places=2,default=0)
    fixed_deduction=models.DecimalField(max_digits=14,decimal_places=2,default=0)
    income_tax=models.DecimalField(max_digits=14,decimal_places=2,default=0)
    net_salary=models.DecimalField(max_digits=14,decimal_places=2,default=0)
    status=models.CharField(max_length=20,choices=STATUS,default='draft')
    paid_on=models.DateField(null=True,blank=True)
    payment_reference=models.CharField(max_length=120,blank=True)
    approval_note=models.TextField(blank=True)
    approved_by=models.ForeignKey(settings.AUTH_USER_MODEL,on_delete=models.PROTECT,null=True,blank=True,related_name='payroll_records_approved')
    approved_at=models.DateTimeField(null=True,blank=True)
    created_by=models.ForeignKey(settings.AUTH_USER_MODEL,on_delete=models.PROTECT,null=True,blank=True)
    class Meta:
        ordering=['-period_month','employee__name']
        constraints=[models.UniqueConstraint(fields=['employee','period_month'],name='uniq_employee_payroll_month')]


class Member(TimeStamped):
    branch=models.ForeignKey(Branch,on_delete=models.PROTECT,related_name='members')
    area=models.ForeignKey(Area,on_delete=models.PROTECT,null=True,blank=True,related_name='members')
    centre=models.ForeignKey(Centre,on_delete=models.PROTECT,null=True,blank=True,related_name='members')
    group=models.ForeignKey(Group,on_delete=models.PROTECT,null=True,blank=True,related_name='members')
    field_officer=models.ForeignKey(Employee,on_delete=models.PROTECT,null=True,blank=True,related_name='members')
    branch_manager=models.ForeignKey(Employee,on_delete=models.PROTECT,null=True,blank=True,related_name='managed_members')
    photo_data=models.TextField(blank=True,help_text='Small validated passport-size customer photo data URL.')
    member_no=models.CharField(max_length=40,unique=True); name=models.CharField(max_length=160)
    phone=models.CharField(max_length=20); email=models.EmailField(blank=True); dob=models.DateField(null=True,blank=True)
    gender=models.CharField(max_length=20,blank=True); address=models.TextField(blank=True); state=models.CharField(max_length=100,blank=True,default='')
    occupation=models.CharField(max_length=120,blank=True); household_income=models.DecimalField(max_digits=14,decimal_places=2,default=0)
    kyc_type=models.CharField(max_length=40,blank=True); kyc_id=models.CharField(max_length=80,blank=True)
    father_spouse_name=models.CharField(max_length=160,blank=True,default='')
    city=models.CharField(max_length=100,blank=True,default='')
    aadhaar_number=models.CharField(max_length=20,blank=True,default='')
    pan_number=models.CharField(max_length=20,blank=True,default='')
    cgt_status=models.CharField(max_length=20,blank=True,default='pending')
    grt_status=models.CharField(max_length=20,blank=True,default='pending')
    nominee=models.CharField(max_length=160,blank=True); nominee_relation=models.CharField(max_length=80,blank=True)
    active=models.BooleanField(default=True)
    def __str__(self): return f'{self.member_no} - {self.name}'

class LoanProduct(TimeStamped):
    name=models.CharField(max_length=120); code=models.CharField(max_length=30,unique=True)
    interest_rate=models.DecimalField(max_digits=7,decimal_places=3)
    interest_method=models.CharField(max_length=20,choices=[('flat','Flat'),('reducing','Reducing')],default='flat')
    frequency=models.CharField(max_length=20,choices=[('daily','Daily'),('weekly','Weekly'),('fortnightly','Fortnightly'),('monthly','Monthly')],default='monthly')
    tenure=models.PositiveIntegerField(default=12); processing_fee=models.DecimalField(max_digits=12,decimal_places=2,default=0)
    late_penalty=models.DecimalField(max_digits=12,decimal_places=2,default=0); grace_days=models.PositiveIntegerField(default=0); penalty_scheme=models.ForeignKey('PenaltyScheme',on_delete=models.PROTECT,null=True,blank=True,related_name='loan_products'); max_income_multiple=models.DecimalField(max_digits=7,decimal_places=2,null=True,blank=True); active=models.BooleanField(default=True)
    # Reference Loan Plan screen fields. These are stored separately from the
    # established repayment-pricing fields so adding the UI does not silently
    # change existing loan schedule calculations.
    plan_amount=models.DecimalField(max_digits=14,decimal_places=2,default=0)
    paid_amount=models.DecimalField(max_digits=14,decimal_places=2,default=0)
    recovery_type=models.CharField(max_length=20,choices=[('daily','Daily'),('weekly','Weekly'),('monthly','Monthly')],default='monthly')
    holiday_exclude=models.BooleanField(default=False)
    gst_charge_include=models.BooleanField(default=False)
    file_charge_include=models.BooleanField(default=False)
    file_charge=models.DecimalField(max_digits=12,decimal_places=2,default=0)
    processing_fee_charge_include=models.BooleanField(default=False)
    processing_fee_percentage=models.DecimalField(max_digits=7,decimal_places=3,default=0)
    insurance_fee_charge_include=models.BooleanField(default=False)
    insurance_fee_type=models.CharField(max_length=20,choices=[('fixed','Fixed'),('percentage','Percentage')],default='fixed')
    insurance_fee_amount=models.DecimalField(max_digits=12,decimal_places=2,default=0)
    advance_installment=models.PositiveIntegerField(default=0)

class LoanApplication(TimeStamped):
    STATUS=[('pending','Pending'),('approved','Approved'),('rejected','Rejected')]
    member=models.ForeignKey(Member,on_delete=models.PROTECT,related_name='applications')
    product=models.ForeignKey(LoanProduct,on_delete=models.PROTECT)
    requested_amount=models.DecimalField(max_digits=14,decimal_places=2)
    purpose=models.CharField(max_length=200,blank=True); status=models.CharField(max_length=20,choices=STATUS,default='pending')
    approved_amount=models.DecimalField(max_digits=14,decimal_places=2,null=True,blank=True); notes=models.TextField(blank=True)
    created_by=models.ForeignKey(settings.AUTH_USER_MODEL,on_delete=models.PROTECT,null=True,blank=True,related_name='loan_applications_created')
    approved_by=models.ForeignKey(settings.AUTH_USER_MODEL,on_delete=models.PROTECT,null=True,blank=True,related_name='loan_applications_approved')

class Loan(TimeStamped):
    STATUS=[('draft','Draft'),('pending','Pending'),('approved','Approved'),('disbursed','Disbursed'),('closed','Closed'),('rejected','Rejected'),('restructured','Restructured')]
    member=models.ForeignKey(Member,on_delete=models.PROTECT,related_name='loans'); product=models.ForeignKey(LoanProduct,on_delete=models.PROTECT,related_name='loans')
    application=models.OneToOneField(LoanApplication,on_delete=models.SET_NULL,null=True,blank=True,related_name='loan')
    principal=models.DecimalField(max_digits=14,decimal_places=2); interest_total=models.DecimalField(max_digits=14,decimal_places=2,default=0)
    total_payable=models.DecimalField(max_digits=14,decimal_places=2,default=0); emi_amount=models.DecimalField(max_digits=14,decimal_places=2,default=0)
    start_date=models.DateField(null=True,blank=True); disbursed_on=models.DateField(null=True,blank=True); status=models.CharField(max_length=20,choices=STATUS,default='draft')
    notes=models.TextField(blank=True)
    created_by=models.ForeignKey(settings.AUTH_USER_MODEL,on_delete=models.PROTECT,null=True,blank=True,related_name='loans_created')
    approved_by=models.ForeignKey(settings.AUTH_USER_MODEL,on_delete=models.PROTECT,null=True,blank=True,related_name='loans_approved')
    disbursed_by=models.ForeignKey(settings.AUTH_USER_MODEL,on_delete=models.PROTECT,null=True,blank=True,related_name='loans_disbursed')



class HolidayCalendar(TimeStamped):
    """Organization or branch holiday calendar; informational, does not alter EMI due dates."""
    HOLIDAY_TYPES=[('public','Public Holiday'),('regional','Regional Holiday'),('office','Office Closure'),('working','Special Working Day')]
    branch=models.ForeignKey(Branch,on_delete=models.PROTECT,null=True,blank=True,related_name='holidays')
    holiday_date=models.DateField()
    name=models.CharField(max_length=140)
    holiday_type=models.CharField(max_length=20,choices=HOLIDAY_TYPES,default='public')
    description=models.CharField(max_length=255,blank=True)
    active=models.BooleanField(default=True)
    created_by=models.ForeignKey(settings.AUTH_USER_MODEL,on_delete=models.PROTECT,null=True,blank=True,related_name='holidays_created')
    class Meta:
        ordering=['holiday_date','name']
        constraints=[models.UniqueConstraint(fields=['branch','holiday_date','name'],name='uniq_holiday_branch_date_name')]
    def __str__(self): return f'{self.holiday_date}: {self.name}'


class LoanTopUpRequest(TimeStamped):
    """Maker-checker request for a top-up. Approval alone never changes the existing loan balance."""
    STATUS=[('pending','Pending Approval'),('approved','Approved'),('rejected','Rejected'),('disbursed','Disbursed')]
    loan=models.ForeignKey(Loan,on_delete=models.PROTECT,related_name='topup_requests')
    amount=models.DecimalField(max_digits=14,decimal_places=2)
    reason=models.TextField()
    status=models.CharField(max_length=20,choices=STATUS,default='pending')
    approval_note=models.TextField(blank=True)
    created_by=models.ForeignKey(settings.AUTH_USER_MODEL,on_delete=models.PROTECT,null=True,blank=True,related_name='loan_topups_created')
    approved_by=models.ForeignKey(settings.AUTH_USER_MODEL,on_delete=models.PROTECT,null=True,blank=True,related_name='loan_topups_approved')
    disbursed_by=models.ForeignKey(settings.AUTH_USER_MODEL,on_delete=models.PROTECT,null=True,blank=True,related_name='loan_topups_disbursed')
    approved_at=models.DateTimeField(null=True,blank=True)
    resulting_loan=models.OneToOneField(Loan,on_delete=models.PROTECT,null=True,blank=True,related_name='source_topup_request')
    class Meta:
        ordering=['-created_at','-id']
        constraints=[models.UniqueConstraint(fields=['loan'],condition=models.Q(status='pending'),name='uniq_pending_topup_per_loan')]


class DepositAccount(TimeStamped):
    """Member deposit ledger account. Balance changes only through approved collections."""
    TYPES=[('savings','Savings'),('recurring','Recurring Deposit'),('fixed','Fixed Deposit')]
    STATUS=[('active','Active'),('closed','Closed'),('frozen','Frozen')]
    account_no=models.CharField(max_length=40,unique=True,blank=True)
    member=models.ForeignKey(Member,on_delete=models.PROTECT,related_name='deposit_accounts')
    account_type=models.CharField(max_length=20,choices=TYPES,default='savings')
    opened_on=models.DateField(default=timezone.localdate)
    balance=models.DecimalField(max_digits=14,decimal_places=2,default=0)
    status=models.CharField(max_length=20,choices=STATUS,default='active')
    created_by=models.ForeignKey(settings.AUTH_USER_MODEL,on_delete=models.PROTECT,null=True,blank=True,related_name='deposit_accounts_created')
    class Meta: ordering=['-created_at','-id']
    def __str__(self): return f'{self.account_no} - {self.member.name}'


class DepositCollection(TimeStamped):
    """Pending/approved deposit collection with one-time balance and balanced journal posting."""
    METHODS=[('cash','Cash'),('bank','Bank'),('upi','UPI')]
    STATUS=[('pending','Pending Approval'),('approved','Approved'),('rejected','Rejected')]
    account=models.ForeignKey(DepositAccount,on_delete=models.PROTECT,related_name='collections')
    amount=models.DecimalField(max_digits=14,decimal_places=2)
    collection_date=models.DateField(default=timezone.localdate)
    method=models.CharField(max_length=20,choices=METHODS,default='cash')
    bank_account=models.CharField(max_length=120,blank=True,default='')
    reference=models.CharField(max_length=120,blank=True,default='')
    status=models.CharField(max_length=20,choices=STATUS,default='pending')
    approval_note=models.TextField(blank=True)
    journal_reference=models.CharField(max_length=60,unique=True,blank=True,default='')
    created_by=models.ForeignKey(settings.AUTH_USER_MODEL,on_delete=models.PROTECT,null=True,blank=True,related_name='deposit_collections_created')
    approved_by=models.ForeignKey(settings.AUTH_USER_MODEL,on_delete=models.PROTECT,null=True,blank=True,related_name='deposit_collections_approved')
    approved_at=models.DateTimeField(null=True,blank=True)
    class Meta: ordering=['-collection_date','-id']


class Installment(TimeStamped):
    loan=models.ForeignKey(Loan,on_delete=models.CASCADE,related_name='installments'); number=models.PositiveIntegerField(); due_date=models.DateField()
    principal_due=models.DecimalField(max_digits=14,decimal_places=2); interest_due=models.DecimalField(max_digits=14,decimal_places=2); penalty_due=models.DecimalField(max_digits=14,decimal_places=2,default=0)
    principal_paid=models.DecimalField(max_digits=14,decimal_places=2,default=0); interest_paid=models.DecimalField(max_digits=14,decimal_places=2,default=0); penalty_paid=models.DecimalField(max_digits=14,decimal_places=2,default=0)
    status=models.CharField(max_length=20,default='pending')
    class Meta: unique_together=[('loan','number')]; ordering=['loan_id','number']

class Disbursement(TimeStamped):
    loan=models.OneToOneField(Loan,on_delete=models.PROTECT,related_name='disbursement')
    amount=models.DecimalField(max_digits=14,decimal_places=2); date=models.DateField(default=timezone.localdate)
    method=models.CharField(max_length=20,default='bank'); bank_account=models.CharField(max_length=120,blank=True,default=''); reference=models.CharField(max_length=120,blank=True); status=models.CharField(max_length=20,default='success')

class Payment(TimeStamped):
    METHOD=[('cash','Cash'),('upi','UPI'),('bank','Bank'),('card','Card'),('gateway','Gateway')]
    STATUS=[('success','Success'),('pending','Pending Approval'),('failed','Failed'),('rejected','Rejected'),('refunded','Refunded'),('reversed','Ledger Reversed — External Refund Not Confirmed')]
    member=models.ForeignKey(Member,on_delete=models.PROTECT,related_name='payments'); loan=models.ForeignKey(Loan,on_delete=models.PROTECT,related_name='payments',null=True,blank=True)
    receipt_no=models.CharField(max_length=50,unique=True); amount=models.DecimalField(max_digits=14,decimal_places=2); method=models.CharField(max_length=40,choices=METHOD)
    reference=models.CharField(max_length=120,blank=True); bank_account=models.CharField(max_length=120,blank=True,default=''); idempotency_key=models.CharField(max_length=100,unique=True,null=True,blank=True); paid_on=models.DateField(default=timezone.localdate); status=models.CharField(max_length=20,choices=STATUS,default='success')
    approval_note=models.TextField(blank=True)
    approved_by=models.ForeignKey(settings.AUTH_USER_MODEL,on_delete=models.PROTECT,null=True,blank=True,related_name='payments_approved')
    approved_at=models.DateTimeField(null=True,blank=True)
    created_by=models.ForeignKey(settings.AUTH_USER_MODEL,on_delete=models.PROTECT,null=True,blank=True,related_name='payments_created')
    is_reversed=models.BooleanField(default=False); reversed_at=models.DateTimeField(null=True,blank=True)
    reversed_by=models.ForeignKey(settings.AUTH_USER_MODEL,on_delete=models.PROTECT,null=True,blank=True,related_name='payments_reversed')
    reversal_reason=models.TextField(blank=True)

class PromiseToPay(TimeStamped):
    """Recovery promise record; recording a promise never posts a payment."""
    STATUS=[('promised','Promised'),('kept','Kept'),('broken','Broken'),('cancelled','Cancelled')]
    loan=models.ForeignKey(Loan,on_delete=models.PROTECT,related_name='promises_to_pay')
    member=models.ForeignKey(Member,on_delete=models.PROTECT,related_name='promises_to_pay')
    promised_date=models.DateField()
    promised_amount=models.DecimalField(max_digits=14,decimal_places=2)
    status=models.CharField(max_length=20,choices=STATUS,default='promised')
    follow_up_note=models.TextField(blank=True)
    created_by=models.ForeignKey(settings.AUTH_USER_MODEL,on_delete=models.PROTECT,null=True,blank=True)

class SettlementCase(TimeStamped):
    """Negotiated settlement request; approval is separate from cash collection/closure."""
    STATUS=[('pending','Pending Approval'),('approved','Approved'),('rejected','Rejected'),('paid','Paid / Closed'),('cancelled','Cancelled')]
    loan=models.ForeignKey(Loan,on_delete=models.PROTECT,related_name='settlement_cases')
    member=models.ForeignKey(Member,on_delete=models.PROTECT,related_name='settlement_cases')
    outstanding_snapshot=models.DecimalField(max_digits=14,decimal_places=2)
    proposed_amount=models.DecimalField(max_digits=14,decimal_places=2)
    discount_amount=models.DecimalField(max_digits=14,decimal_places=2,default=0)
    reason=models.TextField()
    status=models.CharField(max_length=20,choices=STATUS,default='pending')
    approval_note=models.TextField(blank=True)
    created_by=models.ForeignKey(settings.AUTH_USER_MODEL,on_delete=models.PROTECT,null=True,blank=True,related_name='settlements_created')
    approved_by=models.ForeignKey(settings.AUTH_USER_MODEL,on_delete=models.PROTECT,null=True,blank=True,related_name='settlements_approved')
    approved_at=models.DateTimeField(null=True,blank=True)

class ProductLoanRequest(TimeStamped):
    """Approval-only request for financing a physical product purchase.

    It deliberately does not create cash disbursement, loan schedules, or ledger
    entries on approval; those require a configured product-pricing/repayment rule.
    """
    STATUS=[('pending','Pending Approval'),('approved','Approved'),('rejected','Rejected'),('cancelled','Cancelled')]
    member=models.ForeignKey(Member,on_delete=models.PROTECT,related_name='product_loan_requests')
    product_name=models.CharField(max_length=160)
    product_description=models.TextField(blank=True)
    quantity=models.PositiveSmallIntegerField(default=1)
    unit_price=models.DecimalField(max_digits=14,decimal_places=2)
    down_payment=models.DecimalField(max_digits=14,decimal_places=2,default=0)
    financed_amount=models.DecimalField(max_digits=14,decimal_places=2,default=0)
    tenure_installments=models.PositiveSmallIntegerField(default=12)
    purpose=models.TextField(blank=True)
    status=models.CharField(max_length=20,choices=STATUS,default='pending')
    approval_note=models.TextField(blank=True)
    created_by=models.ForeignKey(settings.AUTH_USER_MODEL,on_delete=models.PROTECT,null=True,blank=True,related_name='product_loan_requests_created')
    approved_by=models.ForeignKey(settings.AUTH_USER_MODEL,on_delete=models.PROTECT,null=True,blank=True,related_name='product_loan_requests_approved')
    approved_at=models.DateTimeField(null=True,blank=True)
    class Meta:
        ordering=['-created_at','-id']


class FundsTransferRequest(TimeStamped):
    """Maker-checker workflow for an internal cash/bank transfer, optionally scoped to branches."""
    STATUS=[('pending','Pending Approval'),('approved','Approved'),('rejected','Rejected')]
    date=models.DateField(default=timezone.localdate)
    from_account=models.CharField(max_length=120)
    to_account=models.CharField(max_length=120)
    from_branch=models.ForeignKey('Branch',on_delete=models.PROTECT,null=True,blank=True,related_name='outgoing_fund_transfers')
    to_branch=models.ForeignKey('Branch',on_delete=models.PROTECT,null=True,blank=True,related_name='incoming_fund_transfers')
    amount=models.DecimalField(max_digits=14,decimal_places=2)
    reference=models.CharField(max_length=120,blank=True)
    note=models.TextField(blank=True)
    status=models.CharField(max_length=20,choices=STATUS,default='pending')
    approval_note=models.TextField(blank=True)
    created_by=models.ForeignKey(settings.AUTH_USER_MODEL,on_delete=models.PROTECT,null=True,blank=True,related_name='fund_transfer_requests_created')
    approved_by=models.ForeignKey(settings.AUTH_USER_MODEL,on_delete=models.PROTECT,null=True,blank=True,related_name='fund_transfer_requests_approved')
    approved_at=models.DateTimeField(null=True,blank=True)
    class Meta:
        ordering=['-created_at','-id']


class LoanRecoveryAssignment(TimeStamped):
    """Current recovery responsibility only; never changes loan ownership or ledger balances."""
    loan=models.OneToOneField('Loan',on_delete=models.PROTECT,related_name='recovery_assignment')
    branch=models.ForeignKey('Branch',on_delete=models.PROTECT,related_name='recovery_assignments')
    employee=models.ForeignKey('Employee',on_delete=models.PROTECT,related_name='recovery_assignments')
    updated_by=models.ForeignKey(settings.AUTH_USER_MODEL,on_delete=models.PROTECT,null=True,blank=True,related_name='recovery_assignments_updated')
    source_transfer=models.ForeignKey('OverdueTransferRequest',on_delete=models.PROTECT,null=True,blank=True,related_name='resulting_assignments')


class OverdueTransferRequest(TimeStamped):
    """Maker-checker reassignment of overdue collection responsibility, not a financial posting."""
    STATUS=[('pending','Pending Approval'),('approved','Approved'),('rejected','Rejected')]
    loan=models.ForeignKey('Loan',on_delete=models.PROTECT,related_name='overdue_transfer_requests')
    from_branch=models.ForeignKey('Branch',on_delete=models.PROTECT,related_name='outgoing_overdue_transfers')
    to_branch=models.ForeignKey('Branch',on_delete=models.PROTECT,related_name='incoming_overdue_transfers')
    from_employee=models.ForeignKey('Employee',on_delete=models.PROTECT,null=True,blank=True,related_name='outgoing_overdue_transfers')
    to_employee=models.ForeignKey('Employee',on_delete=models.PROTECT,related_name='incoming_overdue_transfers')
    reason=models.TextField()
    idempotency_key=models.CharField(max_length=100,unique=True)
    overdue_amount_snapshot=models.DecimalField(max_digits=14,decimal_places=2)
    overdue_installments_snapshot=models.PositiveIntegerField(default=0)
    status=models.CharField(max_length=20,choices=STATUS,default='pending')
    created_by=models.ForeignKey(settings.AUTH_USER_MODEL,on_delete=models.PROTECT,related_name='overdue_transfers_created')
    decided_by=models.ForeignKey(settings.AUTH_USER_MODEL,on_delete=models.PROTECT,null=True,blank=True,related_name='overdue_transfers_decided')
    decision_note=models.TextField(blank=True)
    decided_at=models.DateTimeField(null=True,blank=True)
    class Meta:
        ordering=['-created_at','-id']
        constraints=[models.UniqueConstraint(fields=['loan'],condition=models.Q(status='pending'),name='uniq_pending_overdue_transfer_loan')]


class CapitalEntry(TimeStamped):
    KIND=[('in','Investment / Capital In'),('out','Capital Withdrawal / Out')]
    kind=models.CharField(max_length=10,choices=KIND); amount=models.DecimalField(max_digits=14,decimal_places=2); date=models.DateField(default=timezone.localdate)
    bank_account=models.CharField(max_length=120,blank=True,default=''); reference=models.CharField(max_length=100,blank=True); note=models.TextField(blank=True); created_by=models.ForeignKey(settings.AUTH_USER_MODEL,on_delete=models.PROTECT,null=True)
    branch=models.ForeignKey('Branch',on_delete=models.PROTECT,null=True,blank=True,related_name='capital_entries')

class Expense(TimeStamped):
    category=models.CharField(max_length=100); amount=models.DecimalField(max_digits=14,decimal_places=2); date=models.DateField(default=timezone.localdate); note=models.TextField(blank=True)
    branch=models.ForeignKey(Branch,on_delete=models.PROTECT,null=True,blank=True)

class JournalEntry(TimeStamped):
    ENTRY=[('income','Income'),('expense','Expense'),('transfer','Transfer'),('adjustment','Adjustment')]
    date=models.DateField(default=timezone.localdate); entry_type=models.CharField(max_length=20,choices=ENTRY); account=models.CharField(max_length=120)
    # Nullable during the safe migration from legacy free-text accounts. New manual
    # journal batches require an active ChartOfAccount mapping; legacy automated
    # postings are mapped when an exact account-name match exists.
    account_ref=models.ForeignKey('ChartOfAccount',on_delete=models.PROTECT,null=True,blank=True,related_name='journal_entries')
    debit=models.DecimalField(max_digits=14,decimal_places=2,default=0); credit=models.DecimalField(max_digits=14,decimal_places=2,default=0); reference=models.CharField(max_length=120,blank=True); note=models.TextField(blank=True)
    # Nullable for legacy rows; do not guess a branch for historical entries.
    branch=models.ForeignKey('Branch',on_delete=models.PROTECT,null=True,blank=True,related_name='journal_entries')

class AuditLog(TimeStamped):
    user=models.ForeignKey(settings.AUTH_USER_MODEL,on_delete=models.SET_NULL,null=True); action=models.CharField(max_length=80); model_name=models.CharField(max_length=80)
    object_id=models.CharField(max_length=50,blank=True); details=models.JSONField(default=dict); ip_address=models.GenericIPAddressField(null=True,blank=True)


class IntegrationSetting(TimeStamped):
    PROVIDERS=[
        ('razorpay','Razorpay'),('cashfree','Cashfree'),('upi','UPI / AutoPay'),
        ('enach','eNACH / Mandate'),('sms','SMS Gateway'),('whatsapp','WhatsApp'),
        ('smtp','Email / SMTP'),('storage','Object Storage'),
    ]
    provider=models.CharField(max_length=30,choices=PROVIDERS)
    key=models.CharField(max_length=80)
    encrypted_value=models.TextField(blank=True)
    enabled=models.BooleanField(default=False)
    updated_by=models.ForeignKey(settings.AUTH_USER_MODEL,on_delete=models.SET_NULL,null=True,blank=True)

    def set_value(self,value):
        from cryptography.fernet import Fernet
        import base64, hashlib
        key=base64.urlsafe_b64encode(hashlib.sha256(settings.SECRET_KEY.encode()).digest())
        self.encrypted_value=Fernet(key).encrypt((value or '').encode()).decode()

    def get_value(self):
        if not self.encrypted_value: return ''
        from cryptography.fernet import Fernet
        import base64, hashlib
        key=base64.urlsafe_b64encode(hashlib.sha256(settings.SECRET_KEY.encode()).digest())
        return Fernet(key).decrypt(self.encrypted_value.encode()).decode()

    class Meta:
        constraints=[models.UniqueConstraint(fields=['provider','key'],name='uniq_integration_provider_key')]
        ordering=['provider','key']


# KYC documents are stored as private uploads; access must remain behind authenticated APIs.
class KycDocument(TimeStamped):
    DOC_TYPES=[
        ('photo','Customer / Member Photo'),
        ('aadhaar','Aadhaar Card'),
        ('pan','PAN Card'),
        ('identity','Other Identity Proof'),
        ('address','Address Proof'),
        ('bank_passbook','Bank Passbook'),
        ('bank_statement','Bank Statement'),
        ('cancelled_cheque','Cancelled Cheque'),
        ('income','Income Proof'),
        ('signature','Customer Signature'),
        ('voter_id','Voter ID'),
        ('driving_license','Driving Licence'),
        ('passport','Passport'),
        ('utility_bill','Utility Bill'),
        ('loan_agreement','Signed Loan Agreement'),
        ('nominee_document','Nominee / Guarantor Document'),
        ('other','Other Supporting Document'),
    ]
    member=models.ForeignKey(Member,on_delete=models.CASCADE,related_name='kyc_documents')
    document_type=models.CharField(max_length=40)
    file=models.FileField(upload_to='private/kyc/%Y/%m/')
    original_name=models.CharField(max_length=255)
    content_type=models.CharField(max_length=100,blank=True)
    size_bytes=models.PositiveBigIntegerField(default=0)
    verified=models.BooleanField(default=False)
    verification_note=models.CharField(max_length=255,blank=True)
    uploaded_by=models.ForeignKey(settings.AUTH_USER_MODEL,on_delete=models.PROTECT,null=True,blank=True)
    class Meta:
        ordering=['-created_at']


class ChartOfAccount(TimeStamped):
    """Configurable account classification for management financial statements.

    JournalEntry.account is currently a legacy text field; reports match account
    names case-insensitively and explicitly return unclassified journal names.
    """
    TYPES=[('asset','Asset'),('liability','Liability'),('equity','Equity'),('income','Income'),('expense','Expense')]
    code=models.CharField(max_length=30,unique=True)
    name=models.CharField(max_length=120,unique=True)
    account_type=models.CharField(max_length=20,choices=TYPES)
    active=models.BooleanField(default=True)
    description=models.CharField(max_length=255,blank=True)
    class Meta: ordering=['code']
    def __str__(self): return f'{self.code} - {self.name}'



class CustomRole(TimeStamped):
    """Database-backed reusable role with explicit feature grants."""
    name=models.CharField(max_length=80, unique=True)
    code=models.SlugField(max_length=80, unique=True)
    description=models.CharField(max_length=255, blank=True)
    permissions=models.JSONField(default=dict, blank=True)
    active=models.BooleanField(default=True)
    is_system=models.BooleanField(default=False)
    created_by=models.ForeignKey(settings.AUTH_USER_MODEL,on_delete=models.SET_NULL,null=True,blank=True,related_name='custom_roles_created')
    class Meta:
        ordering=['name']
    def __str__(self):
        return self.name


class StaffProfile(TimeStamped):
    """Organization role and explicit feature permissions for an application user."""
    ROLE_CHOICES=[
        ('admin','Administrator'),('manager','Branch Manager'),('loan_officer','Loan Officer'),
        ('accountant','Accountant'),('field_officer','Field Officer / Collector'),('auditor','Auditor'),
    ]
    user=models.OneToOneField(settings.AUTH_USER_MODEL,on_delete=models.CASCADE,related_name='staff_profile')
    role=models.CharField(max_length=30,choices=ROLE_CHOICES,default='loan_officer')
    custom_role=models.ForeignKey('CustomRole',on_delete=models.PROTECT,null=True,blank=True,related_name='staff_profiles')
    branch=models.ForeignKey('Branch',on_delete=models.PROTECT,null=True,blank=True,related_name='staff_profiles')
    permissions=models.JSONField(default=dict,blank=True,help_text='Explicit feature permissions granted by an administrator.')
    active=models.BooleanField(default=True)
    created_by=models.ForeignKey(settings.AUTH_USER_MODEL,on_delete=models.SET_NULL,null=True,blank=True,related_name='staff_profiles_created')

    def __str__(self):
        return f'{self.user.username} ({self.get_role_display()})'

class BankStatementImportBatch(TimeStamped):
    """Auditable CSV import and close control for a single bank statement file."""
    STATUS=[('imported','Imported'),('reconciled','Reconciled')]
    bank_account=models.CharField(max_length=120)
    file_name=models.CharField(max_length=255)
    file_sha256=models.CharField(max_length=64,unique=True)
    statement_start=models.DateField()
    statement_end=models.DateField()
    opening_balance=models.DecimalField(max_digits=16,decimal_places=2)
    closing_balance=models.DecimalField(max_digits=16,decimal_places=2)
    total_debit=models.DecimalField(max_digits=16,decimal_places=2,default=0)
    total_credit=models.DecimalField(max_digits=16,decimal_places=2,default=0)
    row_count=models.PositiveIntegerField(default=0)
    status=models.CharField(max_length=20,choices=STATUS,default='imported')
    created_by=models.ForeignKey(settings.AUTH_USER_MODEL,on_delete=models.PROTECT,related_name='bank_statement_batches_created')
    reconciled_by=models.ForeignKey(settings.AUTH_USER_MODEL,on_delete=models.PROTECT,null=True,blank=True,related_name='bank_statement_batches_reconciled')
    reconciled_at=models.DateTimeField(null=True,blank=True)
    reconciliation_note=models.TextField(blank=True)
    class Meta:
        ordering=['-created_at','-id']


class BankReconciliationLine(TimeStamped):
    """Imported/entered bank statement row used to track reconciliation status."""
    STATUS=[('unmatched','Unmatched'),('matched','Matched'),('ignored','Ignored')]
    batch=models.ForeignKey(BankStatementImportBatch,on_delete=models.PROTECT,null=True,blank=True,related_name='lines')
    bank_account=models.CharField(max_length=120)
    statement_date=models.DateField()
    description=models.CharField(max_length=255,blank=True)
    reference=models.CharField(max_length=120,blank=True)
    debit=models.DecimalField(max_digits=14,decimal_places=2,default=0)
    credit=models.DecimalField(max_digits=14,decimal_places=2,default=0)
    statement_balance=models.DecimalField(max_digits=14,decimal_places=2,null=True,blank=True)
    status=models.CharField(max_length=20,choices=STATUS,default='unmatched')
    matched_journal_reference=models.CharField(max_length=120,blank=True)
    reconciliation_note=models.TextField(blank=True)
    created_by=models.ForeignKey(settings.AUTH_USER_MODEL,on_delete=models.PROTECT,null=True,blank=True)
    class Meta:
        ordering=['statement_date','id']
        constraints=[
            models.CheckConstraint(condition=(models.Q(debit__gte=0) & models.Q(credit__gte=0)),name='bank_recon_nonnegative_amounts'),
            models.CheckConstraint(condition=~(models.Q(debit__gt=0) & models.Q(credit__gt=0)),name='bank_recon_one_side_only'),
            models.UniqueConstraint(fields=['bank_account','statement_date','reference','debit','credit'],condition=(models.Q(batch__isnull=False) & models.Q(reference__gt='')),name='uniq_bank_statement_ref_row'),
        ]


class ReferenceMaster(TimeStamped):
    """Editable reference lists requested for member/loan forms."""
    KIND_CHOICES=[('identity_proof','Identity Proof'),('relation','Relation'),('purpose','Purpose'),('reason','Reason'),('designation','Designation')]
    kind=models.CharField(max_length=30,choices=KIND_CHOICES)
    name=models.CharField(max_length=120)
    active=models.BooleanField(default=True)
    class Meta:
        ordering=['kind','name']
        constraints=[models.UniqueConstraint(fields=['kind','name'],name='uniq_reference_master_kind_name')]
    def __str__(self): return f'{self.get_kind_display()}: {self.name}'


class MasterCatalogEntry(TimeStamped):
    """Generic, typed configuration list for branch-independent operational masters."""
    MASTER_KEYS=[
        ('state','State'),('bank','Bank'),('leave_type','Leave Type'),
        ('document_type','Document Type'),('collection_mode','Collection Mode'),
        ('product_category','Product Category'),('product_brand','Product Brand'),
        ('product_variant','Product Variant'),('product_supplier','Product Supplier'),
        ('insurance_party','Insurance Party'),('product_item','Product'),
        ('cgt_grt_record','Member CGT & GRT Record'),('death_member','Death Member Record'),
        ('employee_leave','Employee Leave Record'),('center_leader_history','Center Leader Transfer Record'),
        ('portfolio_transfer','Employee / Member Portfolio Transfer Record'),
        ('loan_form_template','Loan & Operational Form Template'),
    ]
    DOCUMENT_ROLE=[('other','Other'),('identity','Identity Proof'),('address','Address Proof')]
    master_key=models.CharField(max_length=30,choices=MASTER_KEYS)
    name=models.CharField(max_length=120)
    code=models.SlugField(max_length=40)
    short_name=models.CharField(max_length=40,blank=True)
    document_role=models.CharField(max_length=20,choices=DOCUMENT_ROLE,default='other')
    ledger_account=models.CharField(max_length=40,blank=True,default='')
    metadata=models.JSONField(default=dict,blank=True)
    active=models.BooleanField(default=True)
    notes=models.CharField(max_length=255,blank=True)
    class Meta:
        ordering=['master_key','name']
        constraints=[models.UniqueConstraint(fields=['master_key','code'],name='uniq_catalog_key_code')]
    def __str__(self): return f'{self.get_master_key_display()}: {self.name}'


class PenaltyScheme(TimeStamped):
    """A configurable late-penalty policy. Preview calculations never post a charge."""
    PENALTY_TYPE=[('fixed','Fixed Amount'),('percentage','Percentage')]
    PENALTY_MODE=[('one_time','One Time'),('daily','Daily')]
    name=models.CharField(max_length=120,unique=True)
    grace_period_days=models.PositiveSmallIntegerField(default=0)
    penalty_type=models.CharField(max_length=20,choices=PENALTY_TYPE,default='fixed')
    penalty_value=models.DecimalField(max_digits=12,decimal_places=2,default=0,help_text='Fixed currency amount or percentage rate, depending on penalty_type.')
    minimum_due_amount=models.DecimalField(max_digits=14,decimal_places=2,default=0)
    penalty_mode=models.CharField(max_length=20,choices=PENALTY_MODE,default='one_time')
    recurring=models.BooleanField(default=False)
    active=models.BooleanField(default=True)
    class Meta: ordering=['name']
    def calculate_penalty(self, overdue_amount, overdue_days, already_assessed=False):
        """Calculate a preview amount without posting a transaction.

        Percentage uses the eligible overdue amount as its base (not a compounded
        penalty). Daily + recurring applies the configured amount/rate once per
        day after the grace window. Callers must atomically record a unique
        assessment before charging; this method itself is side-effect free.
        """
        from decimal import Decimal, ROUND_HALF_UP, InvalidOperation
        try:
            amount=Decimal(str(overdue_amount))
            raw_days=Decimal(str(overdue_days))
            if not raw_days.is_finite() or raw_days != raw_days.to_integral_value():
                raise ValueError('Overdue days must be a whole number.')
            days=int(raw_days)
            if not amount.is_finite() or amount < 0 or amount > Decimal('999999999999.99'):
                raise ValueError('Overdue amount must be between 0 and INR 999,999,999,999.99.')
            amount=amount.quantize(Decimal('0.01'),rounding=ROUND_HALF_UP)
        except (InvalidOperation, TypeError, ValueError) as exc:
            raise ValueError('Overdue amount and overdue days must be valid, finite values; days must be a whole number.') from exc
        if days < 0:
            raise ValueError('Overdue days cannot be negative.')
        if amount < self.minimum_due_amount or days <= self.grace_period_days or already_assessed or not self.active:
            return Decimal('0.00')
        charge=self.penalty_value if self.penalty_type=='fixed' else amount*self.penalty_value/Decimal('100')
        charge=charge.quantize(Decimal('0.01'),rounding=ROUND_HALF_UP)
        if self.penalty_mode=='daily' and self.recurring:
            # Daily accrual is computed cumulatively; callers post only the delta
            # from immutable prior assessments. Each day's charge is rounded first.
            charge *= Decimal(days-self.grace_period_days)
        charge=charge.quantize(Decimal('0.01'),rounding=ROUND_HALF_UP)
        if charge > Decimal('999999999999.99'):
            raise ValueError('Calculated penalty exceeds the supported INR amount range.')
        return charge


class SoftwareTiming(TimeStamped):
    """Office/session timing settings used for login and operator warnings."""
    name=models.CharField(max_length=80,default='Default Working Hours',unique=True)
    office_start=models.TimeField(default=datetime.time(9,0))
    office_end=models.TimeField(default=datetime.time(18,0))
    timezone_name=models.CharField(max_length=80,default='Asia/Kolkata')
    auto_logout_minutes=models.PositiveSmallIntegerField(default=0,help_text='0 disables automatic logout.')
    working_days=models.JSONField(default=list,blank=True)
    active=models.BooleanField(default=True)
    class Meta: ordering=['name']


class FinancialSession(TimeStamped):
    """Financial year/session master; active date ranges must not overlap."""
    name=models.CharField(max_length=40,unique=True)
    start_date=models.DateField()
    end_date=models.DateField()
    active=models.BooleanField(default=True)
    class Meta: ordering=['-start_date','name']


class FinancialPeriodLockRequest(TimeStamped):
    """Maker-checker request to lock a ledger date range against new postings."""
    STATUS=[('pending','Pending Approval'),('approved','Locked'),('rejected','Rejected')]
    start_date=models.DateField()
    end_date=models.DateField()
    reason=models.TextField()
    status=models.CharField(max_length=20,choices=STATUS,default='pending')
    created_by=models.ForeignKey(settings.AUTH_USER_MODEL,on_delete=models.PROTECT,related_name='financial_locks_created')
    decided_by=models.ForeignKey(settings.AUTH_USER_MODEL,on_delete=models.PROTECT,null=True,blank=True,related_name='financial_locks_decided')
    decision_note=models.TextField(blank=True)
    decided_at=models.DateTimeField(null=True,blank=True)
    class Meta:
        ordering=['-created_at','-id']
        indexes=[models.Index(fields=['status','start_date','end_date'],name='fin_lock_status_dates_idx')]


class PaymentReversalRequest(TimeStamped):
    """Maker-checker request for an audited collection reversal; not proof of cash refund."""
    STATUS=[('pending','Pending Approval'),('approved','Approved / Reversed'),('rejected','Rejected')]
    payment=models.ForeignKey('Payment',on_delete=models.PROTECT,related_name='reversal_requests')
    reason=models.TextField()
    status=models.CharField(max_length=20,choices=STATUS,default='pending')
    idempotency_key=models.CharField(max_length=100,unique=True,null=True,blank=True)
    created_by=models.ForeignKey(settings.AUTH_USER_MODEL,on_delete=models.PROTECT,related_name='payment_reversals_created')
    decided_by=models.ForeignKey(settings.AUTH_USER_MODEL,on_delete=models.PROTECT,null=True,blank=True,related_name='payment_reversals_decided')
    decision_note=models.TextField(blank=True)
    decided_at=models.DateTimeField(null=True,blank=True)
    reversal_reference=models.CharField(max_length=120,blank=True)
    class Meta:
        ordering=['-created_at','-id']
        constraints=[models.UniqueConstraint(fields=['payment'],condition=models.Q(status='pending'),name='uniq_pending_payment_reversal')]


class BusinessSettings(TimeStamped):
    """Singleton JSON settings with server-side allowlist/type/range validation."""
    key=models.CharField(max_length=30,unique=True,default='default')
    values=models.JSONField(default=dict,blank=True)
    updated_by=models.ForeignKey(settings.AUTH_USER_MODEL,on_delete=models.PROTECT,null=True,blank=True)
    class Meta: ordering=['key']
    def __str__(self): return 'Business settings'


class PenaltyAssessment(TimeStamped):
    """Immutable audit row for each late-penalty amount posted to an installment."""
    SOURCE_CHOICES=[('scheme','Configured Penalty Scheme'),('legacy','Legacy Loan Plan Penalty')]
    installment=models.ForeignKey(Installment,on_delete=models.PROTECT,related_name='penalty_assessments')
    scheme=models.ForeignKey(PenaltyScheme,on_delete=models.PROTECT,null=True,blank=True,related_name='assessments')
    assessment_date=models.DateField()
    assessment_key=models.CharField(max_length=160,unique=True)
    source=models.CharField(max_length=12,choices=SOURCE_CHOICES)
    overdue_days=models.PositiveIntegerField(default=0)
    overdue_amount=models.DecimalField(max_digits=14,decimal_places=2,default=0)
    amount=models.DecimalField(max_digits=14,decimal_places=2)
    class Meta:
        ordering=['-assessment_date','id']
    def __str__(self):
        return f'Penalty assessment {self.assessment_key}: {self.amount}'


class SeriesConfiguration(TimeStamped):
    """Admin-managed numbering prefixes/counters; changing settings never rewrites historical identifiers."""
    key=models.CharField(max_length=40, unique=True)
    label=models.CharField(max_length=100)
    prefix=models.CharField(max_length=20, blank=True, default='')
    next_number=models.PositiveBigIntegerField(default=1)
    include_branch_code=models.BooleanField(default=False)
    include_financial_year=models.BooleanField(default=False)
    class Meta:
        ordering=['id']
    def __str__(self): return self.label


class HouseholdIncomeAssessment(TimeStamped):
    """Dated household repayment-capacity assessment; does not itself approve a loan."""
    member=models.ForeignKey(Member,on_delete=models.PROTECT,related_name='income_assessments')
    assessment_date=models.DateField(default=timezone.localdate)
    monthly_household_income=models.DecimalField(max_digits=14,decimal_places=2)
    existing_monthly_loan_obligations=models.DecimalField(max_digits=14,decimal_places=2,default=0)
    proposed_monthly_obligation=models.DecimalField(max_digits=14,decimal_places=2,default=0)
    household_size=models.PositiveSmallIntegerField(default=1)
    other_lender_details=models.TextField(blank=True)
    verified=models.BooleanField(default=False)
    verification_note=models.TextField(blank=True)
    assessed_by=models.ForeignKey(settings.AUTH_USER_MODEL,on_delete=models.PROTECT,null=True,blank=True,related_name='household_assessments_created')
    verified_by=models.ForeignKey(settings.AUTH_USER_MODEL,on_delete=models.PROTECT,null=True,blank=True,related_name='household_assessments_verified')
    verified_at=models.DateTimeField(null=True,blank=True)
    class Meta:
        ordering=['-assessment_date','-id']
        constraints=[
            models.CheckConstraint(condition=models.Q(monthly_household_income__gte=0),name='household_income_nonnegative'),
            models.CheckConstraint(condition=models.Q(existing_monthly_loan_obligations__gte=0),name='household_existing_obligation_nonnegative'),
            models.CheckConstraint(condition=models.Q(proposed_monthly_obligation__gte=0),name='household_proposed_obligation_nonnegative'),
            models.CheckConstraint(condition=models.Q(household_size__gte=1),name='household_size_at_least_one'),
        ]


class CustomerComplaint(TimeStamped):
    """Borrower grievance register with auditable assignment and resolution."""
    STATUS=[('open','Open'),('in_review','In Review'),('resolved','Resolved'),('rejected','Rejected')]
    CATEGORY=[('collection','Collection conduct'),('payment','Payment/receipt'),('loan_terms','Loan terms/charges'),('staff','Staff conduct'),('privacy','Data/privacy'),('other','Other')]
    branch=models.ForeignKey(Branch,on_delete=models.PROTECT,related_name='customer_complaints')
    member=models.ForeignKey(Member,on_delete=models.PROTECT,null=True,blank=True,related_name='complaints')
    complaint_no=models.CharField(max_length=40,unique=True)
    category=models.CharField(max_length=30,choices=CATEGORY,default='other')
    subject=models.CharField(max_length=180)
    description=models.TextField()
    received_date=models.DateField(default=timezone.localdate)
    due_date=models.DateField(null=True,blank=True)
    status=models.CharField(max_length=20,choices=STATUS,default='open')
    assigned_employee=models.ForeignKey(Employee,on_delete=models.PROTECT,null=True,blank=True,related_name='assigned_complaints')
    resolution_note=models.TextField(blank=True)
    resolved_at=models.DateTimeField(null=True,blank=True)
    created_by=models.ForeignKey(settings.AUTH_USER_MODEL,on_delete=models.PROTECT,null=True,blank=True,related_name='customer_complaints_created')
    resolved_by=models.ForeignKey(settings.AUTH_USER_MODEL,on_delete=models.PROTECT,null=True,blank=True,related_name='customer_complaints_resolved')
    class Meta: ordering=['-received_date','-id']


class FieldVisitRecord(TimeStamped):
    """Field visit log. A visit record never counts as a payment or changes a loan ledger."""
    OUTCOMES=[('contacted','Customer Contacted'),('not_available','Customer Not Available'),('promise','Promise to Pay'),('dispute','Dispute Raised'),('follow_up','Follow-up Required'),('other','Other')]
    member=models.ForeignKey(Member,on_delete=models.PROTECT,related_name='field_visits')
    loan=models.ForeignKey(Loan,on_delete=models.PROTECT,null=True,blank=True,related_name='field_visits')
    employee=models.ForeignKey(Employee,on_delete=models.PROTECT,related_name='field_visits')
    visit_date=models.DateTimeField(default=timezone.now)
    purpose=models.CharField(max_length=180)
    outcome=models.CharField(max_length=30,choices=OUTCOMES,default='contacted')
    notes=models.TextField(blank=True)
    promised_date=models.DateField(null=True,blank=True)
    promised_amount=models.DecimalField(max_digits=14,decimal_places=2,null=True,blank=True)
    created_by=models.ForeignKey(settings.AUTH_USER_MODEL,on_delete=models.PROTECT,null=True,blank=True,related_name='field_visits_created')
    class Meta: ordering=['-visit_date','-id']
    def clean(self):
        from django.core.exceptions import ValidationError
        if self.promised_amount is not None and self.promised_amount < 0:
            raise ValidationError({'promised_amount':'Promised amount cannot be negative.'})
        if self.loan_id and self.member_id and self.loan.member_id != self.member_id:
            raise ValidationError({'loan':'Selected loan must belong to the selected member.'})


class CashHandoverRequest(TimeStamped):
    """Maker-checker cash custody handover; approval records custody only, not a journal posting."""
    STATUS=[('pending','Pending Approval'),('approved','Approved'),('rejected','Rejected')]
    branch=models.ForeignKey(Branch,on_delete=models.PROTECT,related_name='cash_handovers')
    handover_date=models.DateField(default=timezone.localdate)
    from_employee=models.ForeignKey(Employee,on_delete=models.PROTECT,related_name='cash_handovers_out')
    to_employee=models.ForeignKey(Employee,on_delete=models.PROTECT,related_name='cash_handovers_in')
    amount=models.DecimalField(max_digits=14,decimal_places=2)
    reference=models.CharField(max_length=120,blank=True)
    note=models.TextField()
    idempotency_key=models.CharField(max_length=100,unique=True)
    status=models.CharField(max_length=20,choices=STATUS,default='pending')
    decision_note=models.TextField(blank=True)
    created_by=models.ForeignKey(settings.AUTH_USER_MODEL,on_delete=models.PROTECT,related_name='cash_handovers_created')
    decided_by=models.ForeignKey(settings.AUTH_USER_MODEL,on_delete=models.PROTECT,null=True,blank=True,related_name='cash_handovers_decided')
    decided_at=models.DateTimeField(null=True,blank=True)
    class Meta:
        ordering=['-handover_date','-id']
        constraints=[models.CheckConstraint(condition=models.Q(amount__gt=0),name='cash_handover_amount_positive'),models.UniqueConstraint(fields=['from_employee','to_employee','handover_date'],condition=models.Q(status='pending'),name='uniq_pending_cash_handover_pair_day')]
