from decimal import Decimal, ROUND_HALF_UP, InvalidOperation
from datetime import timedelta
import datetime
import hashlib
import io
from django.db import transaction, connection, IntegrityError
from django.db.models import Sum, Q, F
from django.utils import timezone
from rest_framework import viewsets, status
from rest_framework.decorators import api_view, permission_classes, action
from rest_framework.permissions import IsAuthenticated, IsAdminUser, BasePermission, AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from django.http import FileResponse, Http404, HttpResponse
import csv
from .models import *
from .serializers import *



def _user_has_feature(user, feature):
    """Central feature check shared by API function endpoints and viewsets."""
    if not user or not user.is_authenticated:
        return False
    if user.is_superuser:
        return True
    profile=getattr(user,'staff_profile',None)
    if profile is None:
        return bool(user.is_staff)
    if not profile.active or not user.is_active:
        return False
    if profile.role=='admin':
        return True
    custom_role=getattr(profile,'custom_role',None)
    role_permissions={}
    if custom_role is not None:
        if not custom_role.active:
            return False
        role_permissions=custom_role.permissions or {}
    effective_permissions={**role_permissions, **(profile.permissions or {})}
    return effective_permissions.get(feature,False) is True

def _is_approval_manager(user):
    """Shared guard for final workflow decisions; feature permissions are checked separately."""
    if not user or not user.is_authenticated or not user.is_active:
        return False
    if user.is_superuser or user.is_staff:
        return True
    profile=getattr(user,'staff_profile',None)
    # The viewset permission class has already enforced this action's granular feature
    # grant. Respect explicit custom-role approvals as well as built-in manager roles.
    return bool(profile and profile.active and user.is_active)


def _approval_note(request, *, required=False):
    note=str(request.data.get('approval_note') or request.data.get('reason') or '').strip()
    if required and len(note)<5:
        return None, Response({'approval_note':'Rejection reason must be at least 5 characters.'},status=400)
    return note, None


def _staff_branch_id(user):
    """Return an assigned branch for operational scoping; None means org-wide/admin."""
    if not user or not user.is_authenticated or user.is_superuser:
        return None
    profile=getattr(user,'staff_profile',None)
    if profile is None:
        return None if user.is_staff else False
    if not profile.active or not user.is_active:
        return False
    if profile.role=='admin':
        return None
    return profile.branch_id if profile.branch_id else False

def _deny_unless_feature(request, feature):
    if not _user_has_feature(request.user,feature):
        return Response({'detail':f'This staff account does not have the {feature} permission.'},status=403)
    return None

def _deny_branch_global_accounting(request):
    branch=_staff_branch_id(request.user)
    if branch is False:
        return Response({'detail':'A valid active staff profile or administrator account is required.'},status=403)
    return None


def _journal_queryset_for_request(request):
    """Scope ledger reports to the assigned/selected branch without assigning legacy rows."""
    qs=JournalEntry.objects.all()
    branch=_staff_branch_id(request.user)
    if branch is False:
        return qs.none()
    if branch is not None:
        return qs.filter(branch_id=branch)
    requested=request.query_params.get('branch')
    if requested:
        try: branch_id=int(requested)
        except (TypeError,ValueError):
            from rest_framework.exceptions import ValidationError
            raise ValidationError({'branch':'Select a valid branch id.'})
        if not Branch.objects.filter(pk=branch_id,active=True).exists():
            from rest_framework.exceptions import ValidationError
            raise ValidationError({'branch':'Selected active branch was not found.'})
        return qs.filter(branch_id=branch_id)
    return qs


def _assert_financial_period_open(posting_date):
    """Reject any new ledger posting dated inside an approved financial lock."""
    from rest_framework.exceptions import ValidationError as DRFValidationError
    locked=FinancialPeriodLockRequest.objects.filter(status='approved',start_date__lte=posting_date,end_date__gte=posting_date).first()
    if locked:
        raise DRFValidationError({'date':f'Financial period is locked from {locked.start_date} through {locked.end_date}. Use an approved current-period reversal/adjustment workflow; do not backdate postings.'})


def _execute_payment_reversal(payment_id, actor, reason):
    """Perform a validated, idempotent accounting reversal after maker-checker approval."""
    with transaction.atomic():
        payment=Payment.objects.select_for_update().select_related('member').get(pk=payment_id)
        if payment.status!='success' or payment.is_reversed:
            return {'detail':'Only successful, unreversed payments can be reversed.'},400
        if not payment.loan_id:
            return {'detail':'Only loan-linked collections can be reversed through this workflow.'},400
        loan=Loan.objects.select_for_update().get(pk=payment.loan_id)
        if loan.member_id!=payment.member_id:
            return {'detail':'Payment member does not match the linked loan. Manual review is required; no changes were made.'},409
        later=Payment.objects.filter(loan_id=payment.loan_id,status='success',is_reversed=False).filter(Q(created_at__gt=payment.created_at)|Q(created_at=payment.created_at,pk__gt=payment.pk)).exists()
        if later:
            return {'detail':'A later successful collection exists for this loan. Reverse later collections first.'},409
        installments=list(loan.installments.select_for_update().order_by('-number','-id'))
        ref=payment.reference or payment.receipt_no
        receipt_marker=f'receipt {payment.receipt_no}'
        original=list(JournalEntry.objects.select_for_update().filter(reference=ref,note__contains=receipt_marker).order_by('id'))
        if not original:
            return {'detail':'Receipt-specific original accounting entries were not found. No changes were made; manual accounting review is required.'},409
        reversal_ref=f'REV-{payment.receipt_no}'
        if JournalEntry.objects.filter(reference__iexact=reversal_ref).exists():
            return {'detail':'A reversal reference already exists for this receipt. No changes were made.'},409
        original_debits=sum((row.debit for row in original),Decimal('0'))
        original_credits=sum((row.credit for row in original),Decimal('0'))
        if original_debits!=original_credits:
            return {'detail':'Original receipt journal entries are not balanced. No changes were made; manual accounting review is required.'},409
        category_accounts={'principal':'Loans Receivable','interest':'Interest Income','penalty':'Penalty Income'}
        to_reverse={category:sum((row.credit for row in original if row.account.casefold()==account.casefold()),Decimal('0')) for category,account in category_accounts.items()}
        if sum(to_reverse.values(),Decimal('0'))!=payment.amount:
            return {'detail':'Receipt journal categories do not equal the payment amount. No changes were made; manual accounting review is required.'},409
        fields={'principal':'principal_paid','interest':'interest_paid','penalty':'penalty_paid'}
        new_values={inst.pk:{field:getattr(inst,field) for field in fields.values()} for inst in installments}
        for category in ('principal','interest','penalty'):
            remaining=to_reverse[category]; field=fields[category]
            for inst in installments:
                current=new_values[inst.pk][field]; take=min(current,remaining)
                if take:
                    new_values[inst.pk][field]=current-take; remaining-=take
                if remaining<=0: break
            if remaining>0:
                return {'detail':f'Installment balances do not support a safe {category} reversal. No changes were committed.'},409
        posting_date=timezone.localdate()
        try:
            _assert_financial_period_open(posting_date)
        except Exception as exc:
            detail=getattr(exc,'detail',str(exc))
            return {'detail':detail},409
        # Apply only after all guards pass. Every new line retains original branch/account mapping.
        for inst in installments:
            for field in fields.values(): setattr(inst,field,new_values[inst.pk][field])
            inst.status='paid' if (inst.principal_paid>=inst.principal_due and inst.interest_paid>=inst.interest_due and inst.penalty_paid>=inst.penalty_due) else ('partial' if (inst.principal_paid or inst.interest_paid or inst.penalty_paid) else 'pending')
            inst.save(update_fields=['principal_paid','interest_paid','penalty_paid','status','updated_at'])
        for row in original:
            if row.debit:
                JournalEntry.objects.create(date=posting_date,entry_type='adjustment',account=row.account,account_ref=row.account_ref,branch=row.branch,debit=Decimal('0'),credit=row.debit,reference=reversal_ref,note=f'Reversal of {payment.receipt_no}: {reason}')
            if row.credit:
                JournalEntry.objects.create(date=posting_date,entry_type='adjustment',account=row.account,account_ref=row.account_ref,branch=row.branch,debit=row.credit,credit=Decimal('0'),reference=reversal_ref,note=f'Reversal of {payment.receipt_no}: {reason}')
        payment.is_reversed=True; payment.status='reversed'; payment.reversed_at=timezone.now(); payment.reversed_by=actor; payment.reversal_reason=reason
        payment.save(update_fields=['is_reversed','status','reversed_at','reversed_by','reversal_reason','updated_at'])
        if loan.status=='closed': loan.status='disbursed'; loan.save(update_fields=['status','updated_at'])
        AuditLog.objects.create(user=actor,action='reverse_payment',model_name='Payment',object_id=str(payment.pk),details={'receipt_no':payment.receipt_no,'amount':str(payment.amount),'reversal_reference':reversal_ref,'reason':reason,'approved_by':actor.pk,'cash_bank_refund_verified':False})
        return {'detail':'Ledger reversal completed after approval. This does not confirm that cash/bank funds were actually refunded; reconcile the external refund separately.','receipt_no':payment.receipt_no,'reversal_reference':reversal_ref,'status':payment.status},200


def _post_pair(*, date, debit_account, credit_account, amount, reference, note='', branch=None, debit_branch=None, credit_branch=None):
    """Create a balanced immutable pair for an internal financial transaction.

    This is an internal ledger foundation; production chart-of-accounts mapping and
    external reconciliation still require deployment-specific review.
    """
    _assert_financial_period_open(date)
    amount=Decimal(str(amount)).quantize(Decimal('0.01'),ROUND_HALF_UP)
    if amount <= 0:
        return
    if debit_branch is None: debit_branch=branch
    if credit_branch is None: credit_branch=branch
    # Resolve only exact case-insensitive chart names. Never guess a mapping.
    debit_matches=list(ChartOfAccount.objects.filter(active=True,name__iexact=str(debit_account).strip())[:2])
    credit_matches=list(ChartOfAccount.objects.filter(active=True,name__iexact=str(credit_account).strip())[:2])
    debit_ref=debit_matches[0] if len(debit_matches)==1 else None
    credit_ref=credit_matches[0] if len(credit_matches)==1 else None
    JournalEntry.objects.bulk_create([
        JournalEntry(date=date,entry_type='adjustment',account=debit_account,account_ref=debit_ref,debit=amount,credit=Decimal('0'),reference=reference,note=note,branch=debit_branch),
        JournalEntry(date=date,entry_type='adjustment',account=credit_account,account_ref=credit_ref,debit=Decimal('0'),credit=amount,reference=reference,note=note,branch=credit_branch),
    ])

def _money_account(method, bank_account=''):
    # Keep cash as its own ledger; bank collections should name the actual company account.
    if method == 'bank' and str(bank_account or '').strip():
        return f'Bank: {str(bank_account).strip()}'
    builtin={'cash':'Cash','bank':'Bank','upi':'UPI Clearing','card':'Card Clearing','gateway':'Gateway Clearing'}
    if method in builtin: return builtin[method]
    custom=MasterCatalogEntry.objects.filter(master_key='collection_mode',code=method,active=True).first()
    if custom and custom.ledger_account in {'Cash','Bank','UPI Clearing','Card Clearing','Gateway Clearing'}:
        return custom.ledger_account
    # Never silently direct an unknown collection mode into Cash.
    from rest_framework.exceptions import ValidationError
    raise ValidationError({'method':'Collection mode has no active ledger mapping. Please activate and map the mode before posting.'})


def _ledger_lock_id(account):
    """Stable signed-bigint lock key shared by all workers for a ledger account."""
    normalized=str(account or '').strip().casefold()
    digest=hashlib.blake2b(('nmfa-ledger-account:' + normalized).encode('utf-8'),digest_size=8).digest()
    return int.from_bytes(digest,'big',signed=True)

def _lock_ledger_accounts(account_names):
    """Serialize balance checks/postings per account, including accounts with zero rows.

    SELECT FOR UPDATE over existing journal rows alone is insufficient: when an account
    has no rows, concurrent disbursements can both observe an empty balance and overspend.
    PostgreSQL transaction-scoped advisory locks prevent this phantom-row race. Names are
    acquired in stable order to avoid cross-account transfer deadlocks.
    Callers must already be inside transaction.atomic().
    """
    names=sorted({str(name or '').strip().casefold() for name in account_names if str(name or '').strip()})
    if not connection.in_atomic_block:
        raise RuntimeError('Ledger balance locks require transaction.atomic().')
    if connection.vendor == 'postgresql':
        with connection.cursor() as cursor:
            for name in names:
                cursor.execute('SELECT pg_advisory_xact_lock(%s)',[_ledger_lock_id(name)])
    else:
        # Development/test fallback. PostgreSQL is required for production concurrency
        # guarantees; on other engines lock rows that already exist for basic safety.
        for name in names:
            list(JournalEntry.objects.select_for_update().filter(account__iexact=name).order_by('id').values_list('pk',flat=True))

def _ledger_balance(account, branch=None, *, branch_scoped=False):
    """Available book balance. Default is org-wide; branch_scoped=True isolates one branch or unallocated legacy rows."""
    _lock_ledger_accounts([account])
    qs=JournalEntry.objects.filter(account__iexact=account)
    if branch_scoped:
        qs=qs.filter(branch_id=branch) if branch is not None else qs.filter(branch__isnull=True)
    totals=qs.aggregate(debits=Sum('debit'),credits=Sum('credit'))
    return (totals['debits'] or Decimal('0'))-(totals['credits'] or Decimal('0'))

def _locked_ledger_balance(account_names):
    """Lock account names even when empty, then compute their committed book balances."""
    _lock_ledger_accounts(account_names)
    balances={}
    for account in account_names:
        key=str(account or '').strip().casefold()
        totals=JournalEntry.objects.filter(account__iexact=str(account or '').strip()).aggregate(debits=Sum('debit'),credits=Sum('credit'))
        balances[key]=(totals['debits'] or Decimal('0'))-(totals['credits'] or Decimal('0'))
    return balances



def _effective_collection_status(user, requested_status):
    """Apply the collection-approval setting consistently to create and idempotent retries."""
    values=BusinessSettings.objects.filter(key='default').values_list('values',flat=True).first() or {}
    auto_approve=bool(values.get('auto_approve_member_collection',False))
    if requested_status=='pending' and auto_approve:
        return 'success'
    profile=getattr(user,'staff_profile',None)
    if requested_status=='success' and profile is not None and profile.role!='admin' and not auto_approve:
        return 'pending'
    return requested_status

def _post_successful_collection(payment, *, user, require_loan=False):
    """Allocate a successful collection once and post only balanced ledger pairs."""
    from rest_framework.exceptions import ValidationError
    if payment.amount<=0:
        raise ValidationError({'amount':'A successful collection must be greater than zero.'})
    if not payment.loan_id:
        if require_loan:
            raise ValidationError({'loan':'Select the loan this EMI collection belongs to before approval.'})
        return {'principal':'0.00','interest':'0.00','penalty':'0.00'}
    loan=Loan.objects.select_for_update().select_related('member').get(pk=payment.loan_id)
    if loan.status!='disbursed':
        raise ValidationError({'loan':'Collections can only be posted against a disbursed loan.'})
    installments=list(loan.installments.select_for_update().order_by('number','id'))
    due_total=Decimal('0')
    for inst in installments:
        due_total += max(Decimal('0'),inst.principal_due-inst.principal_paid)
        due_total += max(Decimal('0'),inst.interest_due-inst.interest_paid)
        due_total += max(Decimal('0'),inst.penalty_due-inst.penalty_paid)
    if payment.amount>due_total:
        raise ValidationError({'amount':f'Payment exceeds current loan dues ({due_total}). Record the excess separately instead of losing allocation.'})
    remaining=payment.amount
    allocated={'principal':Decimal('0.00'),'interest':Decimal('0.00'),'penalty':Decimal('0.00')}
    for inst in installments:
        if not (inst.principal_paid<inst.principal_due or inst.interest_paid<inst.interest_due or inst.penalty_paid<inst.penalty_due):
            if inst.status!='paid':
                inst.status='paid'; inst.save(update_fields=['status','updated_at'])
            continue
        for field,category in (('penalty_paid','penalty'),('interest_paid','interest'),('principal_paid','principal')):
            due=getattr(inst,field.replace('_paid','_due'))
            paid=getattr(inst,field)
            balance=max(Decimal('0'),due-paid)
            take=min(remaining,balance)
            if take:
                setattr(inst,field,paid+take)
                allocated[category]+=take
                remaining-=take
        inst.status='paid' if (inst.principal_paid>=inst.principal_due and inst.interest_paid>=inst.interest_due and inst.penalty_paid>=inst.penalty_due) else 'partial'
        inst.save(update_fields=['principal_paid','interest_paid','penalty_paid','status','updated_at'])
        if remaining<=0:
            break
    ref=payment.reference or payment.receipt_no
    cash_account=_money_account(payment.method,payment.bank_account)
    for category,account,note in (
        ('principal','Loans Receivable','Principal collection'),
        ('interest','Interest Income','Interest collection'),
        ('penalty','Penalty Income','Penalty collection'),
    ):
        if allocated[category]:
            _post_pair(date=payment.paid_on,debit_account=cash_account,credit_account=account,amount=allocated[category],reference=ref,note=f'{note} receipt {payment.receipt_no}',branch=payment.member.branch)
    # Derive completion from balances, not from possibly stale status strings.
    still_due=False
    for inst in loan.installments.all():
        if inst.principal_paid<inst.principal_due or inst.interest_paid<inst.interest_due or inst.penalty_paid<inst.penalty_due:
            still_due=True; break
    if not still_due and loan.installments.exists() and loan.status!='closed':
        loan.status='closed'; loan.save(update_fields=['status','updated_at'])
    return {k:str(v.quantize(Decimal('0.01'))) for k,v in allocated.items()}


def _kyc_is_required():
    """KYC mandatory mode defaults to ON and obeys the explicit Business Settings switch."""
    business = BusinessSettings.objects.filter(key='default').first()
    if business and 'customer_kyc_mandatory' in (business.values or {}):
        return bool(business.values['customer_kyc_mandatory'])
    setting = IntegrationSetting.objects.filter(provider="sms", key="feature__kyc_required").first()
    return True if setting is None else bool(setting.enabled)


# These document types are all valid identity evidence in the KYC upload form.
# A document must still be explicitly verified by an authorized staff member.
VERIFIED_IDENTITY_DOCUMENT_TYPES = ('identity', 'aadhaar', 'pan', 'voter_id', 'driving_license', 'passport')
VERIFIED_ADDRESS_DOCUMENT_TYPES = ('address', 'utility_bill')

def _verified_kyc_gaps(member):
    """Verified identity/address docs can use built-in types or active/inactive custom master codes.

    Deactivating a document type prevents new uploads but does not invalidate historical, already
    verified evidence. The category stored on the master record remains the source of its role.
    """
    docs = KycDocument.objects.filter(member=member, verified=True)
    identity_codes = list(MasterCatalogEntry.objects.filter(master_key='document_type', document_role='identity').values_list('code', flat=True))
    address_codes = list(MasterCatalogEntry.objects.filter(master_key='document_type', document_role='address').values_list('code', flat=True))
    # Preserve already verified evidence if a Miscellaneous Identity Proof entry is later deactivated.
    import re, unicodedata
    def slug_name(name):
        text=unicodedata.normalize('NFKD', name).encode('ascii','ignore').decode('ascii').lower()
        return re.sub(r'[^a-z0-9]+','-',text).strip('-')[:40].strip('-')
    identity_codes.extend(slug_name(name) for name in ReferenceMaster.objects.filter(kind='identity_proof').values_list('name',flat=True) if slug_name(name))
    missing = []
    if not docs.filter(document_type__in=tuple(VERIFIED_IDENTITY_DOCUMENT_TYPES) + tuple(identity_codes)).exists():
        missing.append('identity')
    if not docs.filter(document_type__in=tuple(VERIFIED_ADDRESS_DOCUMENT_TYPES) + tuple(address_codes)).exists():
        missing.append('address')
    return missing

def _kyc_error_detail(missing, stage):
    labels = []
    if 'identity' in missing:
        labels.append('verified identity document (Aadhaar, PAN, Voter ID, Driving Licence, Passport, or Other Identity Proof)')
    if 'address' in missing:
        labels.append('verified address proof')
    return {'detail': 'A verified ' + ' and '.join(labels) + f' is required before {stage}.'}

class StaffFeaturePermission(BasePermission):
    """Enforce explicit per-feature grants for users managed through Staff Users."""
    def has_permission(self, request, view):
        user=request.user
        if not user or not user.is_authenticated:
            return False
        if user.is_superuser:
            return True
        profile=getattr(user,'staff_profile',None)
        # Only legacy Django staff/superusers retain unrestricted access. Ordinary
        # accounts must have an explicitly managed StaffProfile.
        if profile is None:
            return bool(user.is_staff or user.is_superuser)
        if not profile.active or not user.is_active:
            return False
        if getattr(profile,'custom_role_id',None) and not profile.custom_role.active:
            return False
        if profile.role == 'admin':
            return True
        # Custom-role grants must be evaluated alongside per-user grants. Per-user
        # values override a custom role's values, so an explicit False can revoke a
        # role grant for one staff member.
        custom_role=getattr(profile,'custom_role',None)
        role_permissions=(custom_role.permissions or {}) if custom_role and custom_role.active else {}
        effective_permissions={**role_permissions, **(profile.permissions or {})}
        model=getattr(getattr(view,'queryset',None),'model',None)
        name=model.__name__ if model else ''
        action=getattr(view,'action','list')
        feature='view_customers'
        if name == 'ReferenceMaster':
            feature='manage_customers' if action in {'create','update','partial_update','destroy'} else 'view_customers'
        elif name == 'MasterCatalogEntry':
            catalog_key=request.query_params.get('master_key') or request.data.get('master_key')
            if not catalog_key and action in {'update','partial_update','destroy'}:
                try: catalog_key=view.get_object().master_key
                except Exception: catalog_key=''
            if catalog_key == 'loan_form_template':
                if action in {'create','update','partial_update','destroy'}:
                    return bool(effective_permissions.get('manage_settings',False) or effective_permissions.get('manage_company_settings',False) or effective_permissions.get('manage_masters',False) or effective_permissions.get('manage_staff',False))
                return bool(effective_permissions.get('view_loans',False) or effective_permissions.get('create_loan_applications',False) or effective_permissions.get('view_customers',False) or effective_permissions.get('view_masters',False) or effective_permissions.get('view_settings',False) or effective_permissions.get('manage_settings',False) or effective_permissions.get('manage_company_settings',False))
            if action in {'create','update','partial_update','destroy'}:
                feature='manage_hr' if catalog_key in {'leave_type','employee_leave'} else ('manage_products' if catalog_key.startswith('product_') or catalog_key=='insurance_party' else 'manage_customers')
            else:
                feature='view_products' if (catalog_key.startswith('product_') or catalog_key=='insurance_party') else 'view_customers'
        elif name in {'PenaltyScheme','SoftwareTiming','FinancialSession','BusinessSettings','PenaltyAssessment'}:
            feature='manage_staff'
        elif name in {'Member','Employee','Branch','Area','Centre','Group'}:
            feature='manage_customers' if action in {'create','update','partial_update','destroy'} else 'view_customers'
        elif name in {'AttendanceRecord','PayrollRecord'}:
            feature='manage_hr'
        elif name=='HolidayCalendar':
            if action in {'create','update','partial_update','destroy'}: feature='manage_hr'
            else: return bool(effective_permissions.get('manage_hr',False) or effective_permissions.get('view_reports',False))
        elif name=='LoanTopUpRequest':
            if action in {'approve','reject','disburse'}: feature='approve_loans'
            elif action in {'create','update','partial_update','destroy'}: feature='create_loan_applications'
            else: return bool(effective_permissions.get('view_loans',False) or effective_permissions.get('create_loan_applications',False) or effective_permissions.get('approve_loans',False))
        elif name=='DepositAccount':
            feature='manage_accounting' if action in {'create','update','partial_update','destroy'} else 'view_accounting'
        elif name=='DepositCollection':
            if action in {'approve','reject'}: return bool(effective_permissions.get('manage_accounting',False) or effective_permissions.get('collect_payments',False))
            elif action in {'create','update','partial_update','destroy'}: feature='collect_payments'
            else: return bool(effective_permissions.get('view_accounting',False) or effective_permissions.get('manage_accounting',False) or effective_permissions.get('collect_payments',False))
        elif name=='HouseholdIncomeAssessment':
            if action=='verify': feature='verify_household_assessments'
            elif action in {'create','update','partial_update','destroy'}: feature='manage_household_assessments'
            else: feature='view_household_assessments'
        elif name=='CustomerComplaint':
            if action in {'create','update','partial_update','destroy'}: feature='manage_customer_complaints'
            else: feature='view_customer_complaints'
        elif name=='FieldVisitRecord':
            if action in {'create','update','partial_update'}: feature='manage_field_visits'
            else: feature='view_field_visits'
        elif name=='CashHandoverRequest':
            if action in {'approve','reject'}: feature='approve_cash_handovers'
            elif action in {'create','update','partial_update','destroy'}: feature='manage_cash_handovers'
            else: feature='view_cash_handovers'
        elif name=='ProductLoanRequest':
            if action in {'approve','reject'}:
                feature='approve_loans'
            elif action in {'create','update','partial_update','destroy'}:
                return bool(effective_permissions.get('create_loan_applications',False) or effective_permissions.get('approve_loans',False))
            else:
                return bool(effective_permissions.get('view_loans',False) or effective_permissions.get('approve_loans',False) or effective_permissions.get('create_loan_applications',False))
        elif name=='OverdueTransferRequest':
            if action in {'approve','reject'}: feature='approve_overdue_transfers'
            elif action in {'create','update','partial_update','destroy'}: feature='manage_overdue_transfers'
            else: return bool(effective_permissions.get('view_overdue_transfers',False) or effective_permissions.get('manage_overdue_transfers',False) or effective_permissions.get('approve_overdue_transfers',False) or effective_permissions.get('view_loans',False))
        elif name=='FundsTransferRequest':
            if action in {'approve','reject'}:
                feature='approve_fund_transfers'
            elif action in {'create','update','partial_update','destroy'}:
                feature='create_fund_transfers'
            else:
                return bool(effective_permissions.get('view_fund_transfers',False) or effective_permissions.get('view_accounting',False) or effective_permissions.get('manage_accounting',False))
        elif name=='OrganizationProfile':
            feature='manage_company_settings'
        elif name=='KycDocument':
            feature='verify_kyc' if action in {'update','partial_update'} else 'upload_kyc' if action=='create' else 'view_kyc'
        elif name in {'LoanProduct','LoanApplication','Loan','Installment','Disbursement'}:
            feature='view_loans'
            if action=='create': feature='create_loan_applications'
            if action in {'approve','reject','close'}: feature='approve_loans'
            if action=='disburse': feature='disburse_loans'
            if action=='foreclose': feature='collect_payments'
            if name=='LoanApplication' and action=='create': feature='create_loan_applications'
            elif name=='LoanApplication' and action in {'list','retrieve'}:
                return bool(effective_permissions.get('view_loans',False) or effective_permissions.get('approve_loans',False) or effective_permissions.get('create_loan_applications',False))
        elif name=='PromiseToPay':
            feature='collect_payments' if action in {'create','update','partial_update','outcome'} else 'view_loans'
        elif name=='SettlementCase':
            if action in {'approve','reject'}:
                feature='approve_loans'
            elif action in {'create','update','partial_update'}:
                feature='collect_payments'
            else:
                return bool(effective_permissions.get('view_loans',False) or effective_permissions.get('approve_loans',False) or effective_permissions.get('collect_payments',False))
        elif name=='Payment':
            if action in {'create','update','partial_update','reverse','approve','reject'}:
                feature='collect_payments'
            else:
                return bool(effective_permissions.get('view_loans',False) or effective_permissions.get('collect_payments',False))
        elif name=='FinancialPeriodLockRequest':
            if action in {'approve','reject'}: return bool(effective_permissions.get('approve_financial_locks',False))
            if action=='create': return bool(effective_permissions.get('manage_financial_locks',False))
            return bool(effective_permissions.get('view_accounting',False) or effective_permissions.get('manage_financial_locks',False) or effective_permissions.get('approve_financial_locks',False))
        elif name=='PaymentReversalRequest':
            if action in {'approve','reject'}: return bool(effective_permissions.get('approve_payment_reversals',False))
            if action=='request_reversal': return bool(effective_permissions.get('manage_payment_reversals',False))
            return bool(effective_permissions.get('view_accounting',False) or effective_permissions.get('manage_payment_reversals',False) or effective_permissions.get('approve_payment_reversals',False))
        elif name in {'CapitalEntry','Expense','JournalEntry','ChartOfAccount','BankReconciliationLine','BankStatementImportBatch','IntegrationSetting'}:
            feature='manage_accounting' if action in {'create','update','partial_update','destroy','post_batch','import_csv','mark_matched','mark_ignored','reconcile'} else 'view_accounting'
        # Granular permission aliases make the Permission List controls enforceable
        # at the API layer, not merely reflected in the frontend. Keep legacy keys
        # supported so existing staff profiles are not silently locked out.
        # Do not treat an unrelated true permission as a universal grant. Only the
        # permission mapped to this module/action (plus its explicit aliases) can authorize it.
        permission_keys = [feature]

        model_name = name
        is_write = action in {'create','update','partial_update','destroy','approve','reject','disburse','close','foreclose','reverse','outcome','post_batch','import_csv','mark_matched','mark_ignored','reconcile'}
        is_delete = action == 'destroy'
        is_view = action in {'list','retrieve'}
        module_aliases = {
            'Member': ('view_customers','manage_customers','delete_customers'),
            'KycDocument': ('view_kyc','upload_kyc','verify_kyc'),
            'LoanProduct': ('view_products','manage_products','view_loans'),
            'LoanApplication': ('view_loans','create_loan_applications','update_loan_applications','delete_loan_applications','approve_loans'),
            'Loan': ('view_loans','approve_loans','disburse_loans','collect_payments'),
            'Installment': ('view_loans','view_collections','collect_payments'),
            'Disbursement': ('view_loans','disburse_loans'),
            'Payment': ('view_collections','collect_payments','approve_collections'),
            'PromiseToPay': ('view_ptp','manage_ptp'),
            'SettlementCase': ('view_settlements','manage_settlements','approve_settlements'),
            'PenaltyScheme': ('view_penalties','manage_penalties'),
            'PenaltyAssessment': ('view_penalties','manage_penalties'),
            'Branch': ('view_branches','manage_branches'),
            'Area': ('view_branches','manage_branches'),
            'Centre': ('view_branches','manage_branches'),
            'Group': ('view_branches','manage_branches'),
            'ReferenceMaster': ('view_masters','manage_masters'),
            'MasterCatalogEntry': ('view_masters','manage_masters'),
            'Employee': ('view_hr','manage_hr'),
            'AttendanceRecord': ('view_hr','manage_hr'),
            'PayrollRecord': ('view_hr','manage_hr','approve_salary'),
            'CapitalEntry': ('view_accounting','manage_accounting'),
            'Expense': ('view_accounting','manage_accounting'),
            'JournalEntry': ('view_accounting','manage_accounting','approve_vouchers'),
            'ChartOfAccount': ('view_accounting','manage_accounting'),
            'BankReconciliationLine': ('view_accounting','manage_accounting'),
            'BankStatementImportBatch': ('view_accounting','manage_accounting'),
            'FundsTransferRequest': ('view_fund_transfers','create_fund_transfers','approve_fund_transfers'),
            'OverdueTransferRequest': ('view_overdue_transfers','manage_overdue_transfers','approve_overdue_transfers','view_loans'),
            'OrganizationProfile': ('view_settings','manage_settings','manage_company_settings'),
            'BusinessSettings': ('view_settings','manage_settings','manage_staff'),
            'SoftwareTiming': ('view_settings','manage_settings','manage_staff'),
            'FinancialSession': ('view_settings','manage_settings','manage_staff'),
            'IntegrationSetting': ('view_settings','manage_settings','view_accounting','manage_accounting'),
        }
        aliases = module_aliases.get(model_name, ())
        if is_view:
            candidates = [k for k in aliases if k.startswith('view_')] + permission_keys
            if model_name == 'FundsTransferRequest': candidates += ['view_accounting','manage_accounting']
        elif is_delete:
            candidates = [k for k in aliases if k.startswith('delete_')] + [k for k in permission_keys if k.startswith('delete_')]
        elif action in {'approve','reject'}:
            candidates = [k for k in aliases if k.startswith('approve_')] + [k for k in permission_keys if k.startswith('approve_')]
            if model_name == 'FundsTransferRequest': candidates += ['manage_accounting']
            if model_name == 'OverdueTransferRequest': candidates += ['approve_overdue_transfers']
        elif action in {'disburse','close'}:
            candidates = [k for k in aliases if k.startswith(('disburse_','approve_'))] + permission_keys
        elif action in {'foreclose','reverse','outcome','post_batch'}:
            candidates = [k for k in aliases if k.startswith(('collect_','manage_','approve_'))] + permission_keys
        else:
            candidates = [k for k in aliases if k.startswith(('manage_','create_','upload_','verify_','collect_'))] + permission_keys
        # Never treat an explicitly false legacy permission as a universal deny
        # when a more specific grant is present; any matching explicit grant wins.
        return any(effective_permissions.get(key,False) is True for key in dict.fromkeys(candidates))

class SecureModelViewSet(viewsets.ModelViewSet):
    permission_classes=[IsAuthenticated,StaffFeaturePermission]

    # Sensitive financial mutations are restricted to Django staff/admin accounts.
    # Read access remains authenticated; deployment should additionally map real
    # organization roles and branch scopes before enabling field-user accounts.
    STAFF_WRITE_MODELS = {'CapitalEntry', 'Expense', 'JournalEntry', 'IntegrationSetting'}

    def get_permissions(self):
        model = getattr(getattr(self, 'queryset', None), 'model', None)
        model_name = model.__name__ if model else ''
        # Provider credentials stay superuser/staff-admin only. Other operations
        # use the explicit feature grant assigned by an administrator.
        if model_name == 'IntegrationSetting':
            return [IsAuthenticated(), IsAdminUser()]
        return [IsAuthenticated(), StaffFeaturePermission()]

    def get_queryset(self):
        # Apply branch scoping to models with a reliable branch relationship.
        # Organization-level records without branch ownership are hidden from
        # branch-only staff rather than leaking company-wide records.
        qs = super().get_queryset()
        user = self.request.user
        if not user or not user.is_authenticated or user.is_superuser:
            return qs
        profile = getattr(user, 'staff_profile', None)
        if profile is None:
            return qs if user.is_staff else qs.none()
        if not profile.active or not user.is_active:
            return qs.none()
        if profile.role == 'admin':
            return qs
        branch_id = profile.branch_id
        model = getattr(getattr(self, 'queryset', None), 'model', None)
        model_name = model.__name__ if model else ''
        if not branch_id:
            if profile.role in {'accountant','auditor'} and model_name in {'CapitalEntry','Expense','JournalEntry','ChartOfAccount','FundsTransferRequest','BankStatementImportBatch'}:
                return qs
            return qs.none()
        if model_name == 'HolidayCalendar':
            return qs.filter(Q(branch_id=branch_id) | Q(branch__isnull=True))
        field_by_model = {
            'Branch': 'pk', 'Area': 'branch_id', 'Centre': 'area__branch_id',
            'Group': 'centre__area__branch_id', 'Employee': 'branch_id',
            'Member': 'branch_id', 'KycDocument': 'member__branch_id',
            'LoanApplication': 'member__branch_id', 'Loan': 'member__branch_id',
            'Installment': 'loan__member__branch_id', 'Disbursement': 'loan__member__branch_id',
            'Payment': 'member__branch_id', 'ProductLoanRequest': 'member__branch_id', 'LoanTopUpRequest': 'loan__member__branch_id', 'DepositAccount': 'member__branch_id', 'DepositCollection': 'account__member__branch_id', 'Expense': 'branch_id', 'CapitalEntry': 'branch_id', 'JournalEntry': 'branch_id', 'AttendanceRecord': 'employee__branch_id', 'PayrollRecord': 'employee__branch_id',
            'HouseholdIncomeAssessment': 'member__branch_id', 'CustomerComplaint': 'branch_id', 'FieldVisitRecord': 'member__branch_id', 'CashHandoverRequest': 'branch_id',
            'PromiseToPay': 'member__branch_id', 'SettlementCase': 'member__branch_id',
        }
        if model_name == 'OverdueTransferRequest':
            return qs.filter(Q(from_branch_id=branch_id) | Q(to_branch_id=branch_id))
        field = field_by_model.get(model_name)
        if field:
            return qs.filter(**{field: branch_id})
        # Organization-wide masters/products are already guarded by StaffFeaturePermission.
        if model_name in {'LoanProduct','ReferenceMaster','MasterCatalogEntry','PenaltyScheme','SoftwareTiming','FinancialSession','BusinessSettings'}:
            return qs
        if model_name in {'BankStatementImportBatch','BankReconciliationLine'} and profile.role in {'admin','accountant','auditor'}:
            return qs
        return qs.none()

    def perform_create(self,serializer):
        obj=serializer.save(); AuditLog.objects.create(user=self.request.user,action='create',model_name=obj.__class__.__name__,object_id=str(obj.pk),details={})
    def perform_update(self,serializer):
        obj=serializer.save(); AuditLog.objects.create(user=self.request.user,action='update',model_name=obj.__class__.__name__,object_id=str(obj.pk),details={})
    def perform_destroy(self,obj):
        AuditLog.objects.create(user=self.request.user,action='delete',model_name=obj.__class__.__name__,object_id=str(obj.pk),details={}); obj.delete()

class SuperuserOnly(BasePermission):
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.is_superuser)

class CustomRoleViewSet(viewsets.ModelViewSet):
    """Superuser-only database CRUD for reusable roles and permission grants."""
    queryset=CustomRole.objects.all()
    serializer_class=CustomRoleSerializer
    permission_classes=[IsAuthenticated,SuperuserOnly]
    http_method_names=['get','post','patch','put','delete','head','options']

    def perform_create(self,serializer):
        obj=serializer.save(created_by=self.request.user)
        AuditLog.objects.create(user=self.request.user,action='custom_role_create',model_name='CustomRole',object_id=str(obj.pk),details={'name':obj.name,'code':obj.code,'permissions':obj.permissions})

    def perform_update(self,serializer):
        obj=serializer.save()
        AuditLog.objects.create(user=self.request.user,action='custom_role_update',model_name='CustomRole',object_id=str(obj.pk),details={'name':obj.name,'active':obj.active,'permissions':obj.permissions})

    def perform_destroy(self,instance):
        if instance.is_system:
            from rest_framework.exceptions import ValidationError
            raise ValidationError({'detail':'System roles cannot be deleted.'})
        if instance.staff_profiles.exists():
            from rest_framework.exceptions import ValidationError
            raise ValidationError({'detail':'Role is assigned to staff accounts. Reassign them before deleting.'})
        role_id=instance.pk
        role_name=instance.name
        instance.delete()
        AuditLog.objects.create(user=self.request.user,action='custom_role_delete',model_name='CustomRole',object_id=str(role_id),details={'name':role_name})




class BranchLoginView(APIView):
    """Admin-managed, branch-bound login accounts. Branch users cannot create accounts."""
    permission_classes=[IsAuthenticated]

    def _allowed(self, user):
        profile=getattr(user,'staff_profile',None)
        return bool(user.is_superuser or (profile and profile.active and profile.role=='admin' and user.is_active) or (user.is_staff and profile is None and user.is_active))

    def get(self, request):
        if not self._allowed(request.user): return Response({'detail':'Only an administrator can manage branch logins.'},status=403)
        rows=StaffProfile.objects.filter(branch__isnull=False).select_related('user','branch').order_by('branch__name','user__username')
        return Response([{'id':p.user_id,'username':p.user.username,'first_name':p.user.first_name,'last_name':p.user.last_name,'email':p.user.email,'branch':p.branch_id,'branch_name':p.branch.name,'role':p.role,'active':bool(p.active and p.user.is_active)} for p in rows])

    def post(self, request):
        if not self._allowed(request.user): return Response({'detail':'Only an administrator can create branch logins.'},status=403)
        from django.contrib.auth import get_user_model
        from django.contrib.auth.password_validation import validate_password
        from django.core.exceptions import ValidationError as DjangoValidationError
        data=request.data
        username=str(data.get('username','')).strip()
        password=data.get('password','')
        branch_id=data.get('branch')
        if len(username)<3: return Response({'username':'Username must contain at least 3 characters.'},status=400)
        if get_user_model().objects.filter(username__iexact=username).exists(): return Response({'username':'Username already exists.'},status=400)
        if not isinstance(password,str) or len(password)<12: return Response({'password':'Use a password of at least 12 characters.'},status=400)
        try: validate_password(password)
        except DjangoValidationError as exc: return Response({'password':list(exc.messages)},status=400)
        branch=Branch.objects.filter(pk=branch_id,active=True).first()
        if not branch: return Response({'branch':'Choose an active branch.'},status=400)
        User=get_user_model()
        with transaction.atomic():
            user=User.objects.create_user(username=username,password=password,email=str(data.get('email','')).strip(),first_name=str(data.get('first_name','')).strip(),last_name=str(data.get('last_name','')).strip(),is_active=True)
            permissions={'view_dashboard':True,'view_customers':True,'manage_customers':True,'view_kyc':True,'upload_kyc':True,'view_loans':True,'create_loan_applications':True,'update_loan_applications':True,'view_collections':True,'collect_payments':True,'view_settlements':True,'manage_settlements':True,'view_masters':True,'view_branches':True,'view_reports':True,'view_hr':True}
            StaffProfile.objects.create(user=user,role='manager',branch=branch,permissions=permissions,active=True,created_by=request.user)
            AuditLog.objects.create(user=request.user,action='branch_login_create',model_name='User',object_id=str(user.pk),details={'username':username,'branch_id':branch.pk})
        return Response({'id':user.pk,'username':user.username,'branch':branch.pk,'branch_name':branch.name,'role':'manager','active':True},status=201)


class StaffUserViewSet(viewsets.ModelViewSet):
    """Superuser-only staff account creation and role/permission management."""
    serializer_class=StaffUserSerializer
    permission_classes=[IsAuthenticated,SuperuserOnly]
    http_method_names=['get','post','patch','put','head','options']

    def get_queryset(self):
        from django.contrib.auth import get_user_model
        return get_user_model().objects.select_related('staff_profile','staff_profile__branch').order_by('username')

    def perform_create(self,serializer):
        user=serializer.save()
        AuditLog.objects.create(user=self.request.user,action='staff_user_create',model_name='User',object_id=str(user.pk),details={'username':user.username,'role':user.staff_profile.role,'branch_id':user.staff_profile.branch_id})

    def perform_update(self,serializer):
        user=serializer.save()
        profile=getattr(user,'staff_profile',None)
        AuditLog.objects.create(user=self.request.user,action='staff_user_update',model_name='User',object_id=str(user.pk),details={'username':user.username,'role':profile.role if profile else 'admin','active':user.is_active})

def _can_manage_bank_reconciliation(user):
    if not user or not user.is_authenticated or not user.is_active:
        return False
    if user.is_superuser:
        return True
    profile=getattr(user,'staff_profile',None)
    if profile is None:
        return bool(user.is_staff)
    return bool(profile.active and profile.role in {'admin','accountant','auditor'})


class BankStatementImportBatchViewSet(viewsets.ReadOnlyModelViewSet):
    queryset=BankStatementImportBatch.objects.select_related('created_by','reconciled_by').all().order_by('-created_at','-id')
    serializer_class=BankStatementImportBatchSerializer
    permission_classes=[IsAuthenticated,StaffFeaturePermission]

    def get_queryset(self):
        if _can_manage_bank_reconciliation(self.request.user):
            return super().get_queryset()
        return BankStatementImportBatch.objects.none()

    @action(detail=True,methods=['get'])
    def lines(self,request,pk=None):
        batch=self.get_object()
        lines=batch.lines.select_related('created_by').order_by('statement_date','id')
        return Response(BankReconciliationLineSerializer(lines,many=True).data)

    @action(detail=True,methods=['post'])
    @transaction.atomic
    def reconcile(self,request,pk=None):
        batch=self.get_object()
        denied=_deny_unless_feature(request,'manage_accounting')
        if denied is not None: return denied
        batch=BankStatementImportBatch.objects.select_for_update().get(pk=batch.pk)
        if batch.status=='reconciled':
            return Response({'detail':'This statement batch is already reconciled.','batch':self.get_serializer(batch).data},status=409)
        unmatched=batch.lines.filter(status='unmatched').count()
        ignored=batch.lines.filter(status='ignored').count()
        if unmatched:
            return Response({'detail':f'{unmatched} statement lines are still unmatched. Match every line to the ledger before closing.'},status=409)
        if ignored:
            return Response({'detail':f'{ignored} statement lines are marked ignored. A reason alone does not account for money; post the required approved ledger adjustment and match those lines before closing.'},status=409)
        if batch.lines.filter(status='matched',matched_journal_reference='').exists():
            return Response({'detail':'Every matched line must contain a confirmed journal reference. Do not manually mark imported lines as matched.'},status=409)
        calculated=(batch.opening_balance+batch.total_credit-batch.total_debit).quantize(Decimal('0.01'))
        if calculated != batch.closing_balance.quantize(Decimal('0.01')):
            return Response({'detail':'Opening balance + credits - debits does not equal the supplied closing balance.','calculated_closing_balance':str(calculated),'supplied_closing_balance':str(batch.closing_balance)},status=409)
        ledger_opening_totals=JournalEntry.objects.filter(account__iexact=batch.bank_account,date__lt=batch.statement_start).aggregate(debits=Sum('debit'),credits=Sum('credit'))
        ledger_opening=((ledger_opening_totals['debits'] or Decimal('0.00'))-(ledger_opening_totals['credits'] or Decimal('0.00'))).quantize(Decimal('0.01'))
        if ledger_opening != batch.opening_balance.quantize(Decimal('0.01')):
            return Response({'detail':'Bank ledger opening balance does not match the bank statement opening balance. Post/reconcile the approved opening balance before closing this statement.','ledger_opening_balance':str(ledger_opening),'statement_opening_balance':str(batch.opening_balance)},status=409)
        matched_lines=list(batch.lines.filter(status='matched').values('id','statement_date','debit','credit','matched_journal_reference'))
        used_line_ids=set(); unmatched_ledger_rows=[]
        for ledger_row in JournalEntry.objects.filter(account__iexact=batch.bank_account,date__range=(batch.statement_start,batch.statement_end)).order_by('date','id'):
            ref=(ledger_row.reference or '').casefold()
            candidates=[line for line in matched_lines if line['id'] not in used_line_ids and (line['matched_journal_reference'] or '').casefold()==ref and abs((ledger_row.date-line['statement_date']).days)<=3 and line['debit']==ledger_row.credit and line['credit']==ledger_row.debit]
            if not ref or not candidates:
                unmatched_ledger_rows.append(ledger_row.pk)
            else:
                used_line_ids.add(candidates[0]['id'])
        if unmatched_ledger_rows:
            return Response({'detail':'One or more bank-account ledger entries do not have a one-to-one confirmed statement match. Review missing/extra entries before closing.','unmatched_ledger_entry_ids':unmatched_ledger_rows[:25],'unmatched_ledger_entry_count':len(unmatched_ledger_rows)},status=409)
        if len(used_line_ids)!=len(matched_lines):
            return Response({'detail':'One or more matched statement lines do not map to a unique bank-account ledger entry.'},status=409)
        ledger_totals=JournalEntry.objects.filter(account__iexact=batch.bank_account,date__range=(batch.statement_start,batch.statement_end)).aggregate(debits=Sum('debit'),credits=Sum('credit'))
        ledger_net=((ledger_totals['debits'] or Decimal('0.00'))-(ledger_totals['credits'] or Decimal('0.00'))).quantize(Decimal('0.01'))
        statement_net=(batch.total_credit-batch.total_debit).quantize(Decimal('0.01'))
        if ledger_net != statement_net:
            return Response({'detail':'Bank ledger movement does not equal statement movement. Reconcile missing/extra ledger entries before closing.','ledger_net_movement':str(ledger_net),'statement_net_movement':str(statement_net)},status=409)
        note=str(request.data.get('note','')).strip()
        if len(note)<5:
            return Response({'note':'Provide a reconciliation note of at least 5 characters.'},status=400)
        batch.status='reconciled'; batch.reconciled_by=request.user; batch.reconciled_at=timezone.now(); batch.reconciliation_note=note
        batch.save(update_fields=['status','reconciled_by','reconciled_at','reconciliation_note','updated_at'])
        AuditLog.objects.create(user=request.user,action='bank_statement_batch_reconciled',model_name='BankStatementImportBatch',object_id=str(batch.pk),details={'bank_account':batch.bank_account,'file_sha256':batch.file_sha256,'row_count':batch.row_count,'opening_balance':str(batch.opening_balance),'closing_balance':str(batch.closing_balance),'total_debit':str(batch.total_debit),'total_credit':str(batch.total_credit),'note':note})
        return Response(self.get_serializer(batch).data)


class BankReconciliationLineViewSet(SecureModelViewSet):
    queryset=BankReconciliationLine.objects.all().order_by('statement_date','id')
    serializer_class=BankReconciliationLineSerializer
    def get_permissions(self):
        return [IsAuthenticated(),StaffFeaturePermission()]
    def perform_create(self,serializer):
        obj=serializer.save(created_by=self.request.user)
        AuditLog.objects.create(user=self.request.user,action='bank_statement_line_create',model_name='BankReconciliationLine',object_id=str(obj.pk),details={'bank_account':obj.bank_account,'date':str(obj.statement_date),'reference':obj.reference})
    def perform_update(self,serializer):
        current=serializer.instance
        if current.batch_id:
            from rest_framework.exceptions import ValidationError
            raise ValidationError({'detail':'Imported bank statement rows are immutable. Use the audited match/flag actions; corrections require a controlled batch correction workflow.'})
        obj=serializer.save()
        AuditLog.objects.create(user=self.request.user,action='bank_statement_line_update',model_name='BankReconciliationLine',object_id=str(obj.pk),details={'status':obj.status})

    def destroy(self,request,*args,**kwargs):
        line=self.get_object()
        if line.batch_id:
            return Response({'detail':'Imported bank statement rows cannot be deleted; preserve the audit trail.'},status=409)
        return super().destroy(request,*args,**kwargs)

    @action(detail=False,methods=['post'],url_path='import-csv')
    @transaction.atomic
    def import_csv(self,request):
        if not _can_manage_bank_reconciliation(request.user):
            return Response({'detail':'Bank statement imports are restricted to organization admins, accountants, and auditors.'},status=403)
        denied=_deny_unless_feature(request,'manage_accounting')
        if denied is not None: return denied
        upload=request.FILES.get('file')
        bank_account=str(request.data.get('bank_account','')).strip()
        if not upload: return Response({'file':'Upload a bank statement CSV file.'},status=400)
        if not bank_account: return Response({'bank_account':'Bank account name is required and must match an active Chart of Accounts Asset.'},status=400)
        if upload.size<=0 or upload.size>5*1024*1024: return Response({'file':'CSV must be between 1 byte and 5 MB.'},status=400)
        if not ChartOfAccount.objects.filter(name__iexact=bank_account,account_type='asset',active=True).exists():
            return Response({'bank_account':'Configure this bank account as an active Asset in Chart of Accounts first.'},status=400)
        try: raw=upload.read()
        except Exception: return Response({'file':'Could not read the uploaded file.'},status=400)
        file_hash=hashlib.sha256(raw).hexdigest()
        existing=BankStatementImportBatch.objects.filter(file_sha256=file_hash).first()
        if existing:
            return Response({'detail':'This exact CSV file was already imported. Duplicate import blocked.','batch_id':existing.pk,'status':existing.status},status=409)
        try:
            text=raw.decode('utf-8-sig')
            reader=csv.DictReader(io.StringIO(text))
            if not reader.fieldnames: raise ValueError('CSV header row is missing.')
            def norm(x): return str(x or '').strip().lower().replace(' ','_').replace('-','_')
            headers={norm(x):x for x in reader.fieldnames}
            aliases={
                'date':['statement_date','transaction_date','value_date','date'],
                'debit':['debit','withdrawal','withdrawals','debit_amount'],
                'credit':['credit','deposit','deposits','credit_amount'],
                'description':['description','narration','remarks','details'],
                'reference':['reference','ref','reference_no','transaction_id','utr'],
                'balance':['statement_balance','running_balance','balance'],
            }
            mapped={key:next((headers[a] for a in options if a in headers),None) for key,options in aliases.items()}
            for required in ('date','debit','credit'):
                if not mapped[required]: raise ValueError(f'Required CSV column missing: date/statement_date, debit, credit. Found headers: {", ".join(reader.fieldnames)}')
            def parse_date(value):
                value=str(value or '').strip()
                for fmt in ('%Y-%m-%d','%d/%m/%Y','%d-%m-%Y','%d.%m.%Y'):
                    try: return datetime.datetime.strptime(value,fmt).date()
                    except ValueError: pass
                raise ValueError(f'Invalid statement date: {value}')
            def parse_money(value,field,allow_negative=False):
                value=str(value or '').strip().replace(',','').replace('₹','').replace('INR','').strip()
                if value in ('','-'): return Decimal('0.00')
                try: result=Decimal(value).quantize(Decimal('0.01'))
                except (InvalidOperation,ValueError): raise ValueError(f'Invalid amount in {field}: {value}')
                if not result.is_finite() or (result<0 and not allow_negative):
                    qualifier='signed' if allow_negative else 'non-negative'
                    raise ValueError(f'{field} must be a finite {qualifier} amount.')
                return result
            rows=[]; total_debit=Decimal('0.00'); total_credit=Decimal('0.00'); dates=[]; seen_refs=set()
            for index,row in enumerate(reader,start=2):
                if index>5002: raise ValueError('Maximum 5,000 statement rows per import.')
                if not any(str(v or '').strip() for v in row.values()): continue
                date_value=parse_date(row.get(mapped['date']))
                debit=parse_money(row.get(mapped['debit']),'debit')
                credit=parse_money(row.get(mapped['credit']),'credit')
                if debit and credit: raise ValueError(f'Row {index}: debit and credit cannot both be positive.')
                if not debit and not credit: raise ValueError(f'Row {index}: debit or credit must be greater than zero.')
                balance=parse_money(row.get(mapped['balance']),'statement balance',allow_negative=True) if mapped['balance'] else None
                desc=str(row.get(mapped['description']) or '').strip()[:255] if mapped['description'] else ''
                ref=str(row.get(mapped['reference']) or '').strip().upper()[:120] if mapped['reference'] else ''
                if ref:
                    signature=(date_value,ref.casefold(),debit,credit)
                    if signature in seen_refs: raise ValueError(f'Row {index}: duplicate transaction reference/date/amount detected inside this file.')
                    seen_refs.add(signature)
                    if BankReconciliationLine.objects.filter(batch__isnull=False,bank_account__iexact=bank_account,statement_date=date_value,reference__iexact=ref,debit=debit,credit=credit).exists():
                        raise ValueError(f'Row {index}: this bank transaction appears to have been imported already (same account/date/reference/amount).')
                rows.append(BankReconciliationLine(batch=None,bank_account=bank_account,statement_date=date_value,description=desc,reference=ref,debit=debit,credit=credit,statement_balance=balance,status='unmatched',created_by=request.user))
                dates.append(date_value); total_debit+=debit; total_credit+=credit
            if not rows: raise ValueError('CSV contains no valid transaction rows.')
            opening=Decimal(str(request.data.get('opening_balance',''))).quantize(Decimal('0.01'))
            closing=Decimal(str(request.data.get('closing_balance',''))).quantize(Decimal('0.01'))
            period_start=parse_date(request.data.get('statement_start'))
            period_end=parse_date(request.data.get('statement_end'))
            if period_start>period_end: raise ValueError('Statement start date cannot be after statement end date.')
            if min(dates)<period_start or max(dates)>period_end: raise ValueError('Every transaction date must fall within the declared statement period.')
            if not opening.is_finite() or not closing.is_finite(): raise ValueError('Opening and closing balances must be finite amounts.')
        except (UnicodeDecodeError,ValueError,InvalidOperation,TypeError) as exc:
            return Response({'file':str(exc)},status=400)
        try:
            with transaction.atomic():
                batch=BankStatementImportBatch.objects.create(bank_account=bank_account,file_name=upload.name.replace('\\','/')[-255:],file_sha256=file_hash,statement_start=period_start,statement_end=period_end,opening_balance=opening,closing_balance=closing,total_debit=total_debit,total_credit=total_credit,row_count=len(rows),created_by=request.user)
                for row in rows: row.batch=batch
                BankReconciliationLine.objects.bulk_create(rows,batch_size=500)
        except IntegrityError:
            return Response({'detail':'Duplicate statement file or duplicate bank transaction row detected. No import was committed.'},status=409)
        AuditLog.objects.create(user=request.user,action='bank_statement_csv_imported',model_name='BankStatementImportBatch',object_id=str(batch.pk),details={'bank_account':bank_account,'file_sha256':file_hash,'file_name':batch.file_name,'row_count':len(rows),'opening_balance':str(opening),'closing_balance':str(closing),'total_debit':str(total_debit),'total_credit':str(total_credit)})
        return Response(BankStatementImportBatchSerializer(batch).data,status=201)

    @action(detail=True,methods=['post'])
    @transaction.atomic
    def mark_ignored(self,request,pk=None):
        denied=_deny_unless_feature(request,'manage_accounting')
        if denied is not None: return denied
        visible=self.get_object()
        line=BankReconciliationLine.objects.select_for_update().get(pk=visible.pk)
        if line.batch_id and line.batch.status=='reconciled': return Response({'detail':'A reconciled statement batch is immutable.'},status=409)
        if line.status=='matched': return Response({'detail':'A matched statement line cannot be ignored; use the approved correction workflow.'},status=409)
        note=str(request.data.get('note','')).strip()
        if len(note)<5: return Response({'note':'An ignore reason of at least 5 characters is required.'},status=400)
        line.status='ignored'; line.reconciliation_note=note
        line.save(update_fields=['status','reconciliation_note','updated_at'])
        AuditLog.objects.create(user=request.user,action='bank_statement_line_ignored',model_name='BankReconciliationLine',object_id=str(line.pk),details={'batch_id':line.batch_id,'bank_account':line.bank_account,'amount':str(line.debit or line.credit),'reason':note})
        return Response(self.get_serializer(line).data)

    @action(detail=True,methods=['get'])
    def match_suggestions(self,request,pk=None):
        """Suggest exact bank-ledger matches; never changes reconciliation state."""
        line=self.get_object()
        if not ChartOfAccount.objects.filter(name__iexact=line.bank_account,account_type='asset',active=True).exists():
            return Response({'detail':'Configure this bank account as an active Asset in Chart of Accounts first.'},status=400)
        # Bank statement debit = money out, so ledger bank account should be credited.
        # Bank statement credit = money in, so ledger bank account should be debited.
        ledger_side='credit' if line.debit > 0 else 'debit'
        amount=line.debit if line.debit > 0 else line.credit
        qs=JournalEntry.objects.filter(account__iexact=line.bank_account,date__range=(line.statement_date-timedelta(days=3),line.statement_date+timedelta(days=3)))
        qs=qs.filter(**{ledger_side:amount}).exclude(reference='')
        if line.reference:
            qs=qs.filter(reference__iexact=line.reference)
        candidates=[]
        for row in qs.order_by('date','reference','id')[:20]:
            if BankReconciliationLine.objects.filter(status='matched',matched_journal_reference=row.reference,bank_account__iexact=line.bank_account).exists():
                continue
            candidates.append({'journal_id':row.pk,'reference':row.reference,'date':str(row.date),'account':row.account,'debit':str(row.debit),'credit':str(row.credit),'amount':str(amount),'days_difference':abs((row.date-line.statement_date).days)})
        return Response({'statement_line_id':line.pk,'bank_account':line.bank_account,'statement_date':str(line.statement_date),'statement_debit':str(line.debit),'statement_credit':str(line.credit),'suggestions':candidates,'auto_matched':False,'note':'Suggestions only. Confirm the correct transaction before matching.'})

    @action(detail=True,methods=['post'])
    @transaction.atomic
    def mark_matched(self,request,pk=None):
        visible=self.get_object()
        line=BankReconciliationLine.objects.select_for_update().get(pk=visible.pk)
        if line.batch_id and line.batch.status=='reconciled': return Response({'detail':'A reconciled statement batch is immutable.'},status=409)
        if line.status == 'matched':
            return Response({'detail':'This statement line is already matched.'},status=409)
        reference=str(request.data.get('journal_reference','')).strip()
        if not reference:
            return Response({'detail':'journal_reference is required.'},status=400)
        if not ChartOfAccount.objects.filter(name__iexact=line.bank_account,account_type='asset',active=True).exists():
            return Response({'detail':'Configure this bank account as an active Asset in Chart of Accounts before matching.'},status=400)
        if (line.debit or Decimal('0')) == 0 and (line.credit or Decimal('0')) == 0:
            return Response({'detail':'A zero-value statement line cannot be matched.'},status=400)
        if line.debit and line.credit:
            return Response({'detail':'A statement line cannot contain both debit and credit values.'},status=400)
        ledger_side='credit' if line.debit > 0 else 'debit'
        amount=line.debit if line.debit > 0 else line.credit
        rows=JournalEntry.objects.filter(reference=reference,account__iexact=line.bank_account,date__range=(line.statement_date-timedelta(days=3),line.statement_date+timedelta(days=3)),**{ledger_side:amount})
        if not rows.exists():
            return Response({'detail':'No matching bank-ledger entry found. Amount, direction, bank account and date (±3 days) must match.'},status=400)
        if rows.count()!=1:
            return Response({'detail':'The journal reference matches multiple ledger rows. Resolve the ambiguity with a unique reference before matching.'},status=409)
        if BankReconciliationLine.objects.filter(status='matched',matched_journal_reference=reference,bank_account__iexact=line.bank_account).exists():
            return Response({'detail':'This journal reference is already reconciled against another statement line for this bank account.'},status=409)
        line.status='matched'; line.matched_journal_reference=reference
        line.reconciliation_note=str(request.data.get('note',''))[:2000]
        line.save(update_fields=['status','matched_journal_reference','reconciliation_note','updated_at'])
        AuditLog.objects.create(user=request.user,action='bank_statement_line_matched',model_name='BankReconciliationLine',object_id=str(line.pk),details={'journal_reference':reference,'amount':str(amount),'ledger_side':ledger_side})
        return Response(self.get_serializer(line).data)

class ChartOfAccountViewSet(SecureModelViewSet):
    queryset=ChartOfAccount.objects.all().order_by('code')
    serializer_class=ChartOfAccountSerializer
    def get_permissions(self):
        if self.action in {'list','retrieve'}: return [IsAuthenticated(),StaffFeaturePermission()]
        return [IsAuthenticated(),IsAdminUser()]


class HolidayCalendarViewSet(SecureModelViewSet):
    queryset=HolidayCalendar.objects.select_related('branch','created_by').all()
    serializer_class=HolidayCalendarSerializer
    def perform_create(self,serializer):
        obj=serializer.save(created_by=self.request.user)
        AuditLog.objects.create(user=self.request.user,action='holiday_created',model_name='HolidayCalendar',object_id=str(obj.pk),details={'date':str(obj.holiday_date),'name':obj.name,'branch_id':obj.branch_id})
    def perform_update(self,serializer):
        obj=serializer.save()
        AuditLog.objects.create(user=self.request.user,action='holiday_updated',model_name='HolidayCalendar',object_id=str(obj.pk),details={'date':str(obj.holiday_date),'name':obj.name})


class LoanTopUpRequestViewSet(SecureModelViewSet):
    queryset=LoanTopUpRequest.objects.select_related('loan','loan__member','loan__product','created_by','approved_by','resulting_loan').all()
    serializer_class=LoanTopUpRequestSerializer
    http_method_names=['get','post','patch','put','head','options']
    def get_queryset(self):
        qs=FundsTransferRequest.objects.all(); state=self.request.query_params.get('state')
        branch=_staff_branch_id(self.request.user)
        if branch is False: return qs.none()
        if branch is not None: qs=qs.filter(Q(from_branch_id=branch)|Q(to_branch_id=branch))
        return qs.filter(status=state).order_by('-created_at','-id') if state else qs.order_by('-created_at','-id')
    def perform_create(self,serializer):
        branch=_staff_branch_id(self.request.user)
        source=serializer.validated_data.get('from_branch')
        destination=serializer.validated_data.get('to_branch')
        if (source is None) != (destination is None) and branch is not None:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('Only an organization administrator may allocate or return funds between the unallocated ledger and a branch.')
        if branch is False:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('An active branch assignment is required to create a fund transfer.')
        if branch is not None:
            if source is None and destination is None:
                serializer.save(from_branch_id=branch,to_branch_id=branch)
            elif source.pk!=branch or destination.pk!=branch:
                from rest_framework.exceptions import PermissionDenied
                raise PermissionDenied('Branch staff may initiate transfers only within their assigned branch. Cross-branch transfers require an organization administrator.')
        item=serializer.save(created_by=self.request.user) if not serializer.instance else serializer.instance
        AuditLog.objects.create(user=self.request.user,action='loan_topup_submitted',model_name='LoanTopUpRequest',object_id=str(item.pk),details={'loan_id':item.loan_id,'amount':str(item.amount)})
    def perform_update(self,serializer):
        if self.get_object().status!='pending':
            from rest_framework.exceptions import ValidationError
            raise ValidationError({'status':'Only pending top-up requests can be edited.'})
        serializer.save()
    @action(detail=True,methods=['post'])
    @transaction.atomic
    def approve(self,request,pk=None):
        visible=self.get_object(); item=LoanTopUpRequest.objects.select_for_update().select_related('loan','loan__member','loan__product').get(pk=visible.pk)
        if not _is_approval_manager(request.user): return Response({'detail':'Only an authorized loan manager can approve top-up requests.'},status=403)
        if item.created_by_id==request.user.pk: return Response({'detail':'Maker-checker: request creator cannot approve their own top-up.'},status=403)
        if item.status!='pending': return Response({'detail':'Only pending top-up requests can be approved.'},status=409)
        if item.loan.status!='disbursed' or not item.loan.member.active or not item.loan.product.active: return Response({'detail':'The linked loan, member and product must remain active.'},status=400)
        if _kyc_is_required():
            gaps=_verified_kyc_gaps(item.loan.member)
            if gaps: return Response(_kyc_error_detail(gaps,'loan top-up approval'),status=400)
        note,err=_approval_note(request)
        if err: return err
        item.status='approved'; item.approval_note=note; item.approved_by=request.user; item.approved_at=timezone.now()
        item.save(update_fields=['status','approval_note','approved_by','approved_at','updated_at'])
        AuditLog.objects.create(user=request.user,action='loan_topup_approved',model_name='LoanTopUpRequest',object_id=str(item.pk),details={'loan_id':item.loan_id,'amount':str(item.amount),'existing_loan_unchanged':True})
        return Response(self.get_serializer(item).data)
    @action(detail=True,methods=['post'])
    @transaction.atomic
    def reject(self,request,pk=None):
        visible=self.get_object(); item=LoanTopUpRequest.objects.select_for_update().get(pk=visible.pk)
        if item.created_by_id==request.user.pk: return Response({'detail':'Maker-checker: request creator cannot reject their own top-up.'},status=403)
        if item.status!='pending': return Response({'detail':'Only pending top-up requests can be rejected.'},status=409)
        note,err=_approval_note(request,required=True)
        if err: return err
        item.status='rejected'; item.approval_note=note; item.approved_by=request.user; item.approved_at=timezone.now()
        item.save(update_fields=['status','approval_note','approved_by','approved_at','updated_at'])
        AuditLog.objects.create(user=request.user,action='loan_topup_rejected',model_name='LoanTopUpRequest',object_id=str(item.pk),details={'reason':note})
        return Response(self.get_serializer(item).data)
    @action(detail=True,methods=['post'])
    @transaction.atomic
    def disburse(self,request,pk=None):
        visible=self.get_object(); item=LoanTopUpRequest.objects.select_for_update().select_related('loan','loan__member','loan__product').get(pk=visible.pk)
        if item.status=='disbursed' and item.resulting_loan_id:
            return Response({'detail':'Top-up was already disbursed.','resulting_loan_id':item.resulting_loan_id,'status':item.status},status=200)
        if item.status!='approved': return Response({'detail':'Top-up must be approved before disbursement.'},status=409)
        # Re-lock and re-check the source loan at disbursement time. It may have
        # been closed, or the member/product deactivated, after the top-up was approved.
        source_loan=Loan.objects.select_for_update().select_related('member','product').get(pk=item.loan_id)
        item.loan=source_loan
        if source_loan.status!='disbursed' or not source_loan.member.active or not source_loan.product.active:
            return Response({'detail':'The original loan must still be disbursed, and its member and loan product must remain active, at top-up disbursement.'},status=400)
        if request.user.pk in {item.created_by_id,item.approved_by_id}: return Response({'detail':'Maker-checker: top-up requester and approver cannot disburse it.'},status=403)
        if _kyc_is_required():
            gaps=_verified_kyc_gaps(source_loan.member)
            if gaps: return Response(_kyc_error_detail(gaps,'top-up disbursement'),status=400)
        method=str(request.data.get('method','bank')).strip().lower()
        bank_account=str(request.data.get('bank_account') or '').strip()[:120]
        if method not in {'bank','cash'}: return Response({'method':'Choose bank or cash.'},status=400)
        if method=='bank' and not bank_account: return Response({'bank_account':'Bank account is required.'},status=400)
        source_account=f'Bank: {bank_account}' if method=='bank' else 'Cash'
        if JournalEntry.objects.filter(reference__iexact=f'TOPUP-{item.pk}').exists(): return Response({'detail':'Top-up ledger reference already exists; manual review required.'},status=409)
        available=_ledger_balance(source_account, branch=source_loan.member.branch_id, branch_scoped=True)
        if available<item.amount: return Response({'detail':f'Insufficient funds in {source_account}. Available {available:.2f}, required {item.amount:.2f}.'},status=400)
        from datetime import date as date_type
        try: disbursed_date=date_type.fromisoformat(str(request.data.get('date') or timezone.localdate()))
        except (TypeError,ValueError): return Response({'date':'Use YYYY-MM-DD format.'},status=400)
        new_loan=Loan.objects.create(member=item.loan.member,product=item.loan.product,principal=item.amount,status='approved',notes=f'Top-up request #{item.pk} for existing loan #{item.loan_id}',created_by=item.created_by,approved_by=item.approved_by)
        LoanViewSet()._build_schedule(new_loan,disbursed_date)
        new_loan.status='disbursed'; new_loan.disbursed_on=disbursed_date; new_loan.disbursed_by=request.user
        new_loan.save(update_fields=['status','disbursed_on','disbursed_by','updated_at'])
        reference=f'TOPUP-{item.pk}'
        Disbursement.objects.create(loan=new_loan,amount=item.amount,date=disbursed_date,method=method,bank_account=bank_account,reference=reference,status='success')
        _post_pair(date=disbursed_date,debit_account='Loans Receivable',credit_account=source_account,amount=item.amount,reference=reference,note=f'Loan top-up request #{item.pk}; new loan #{new_loan.pk}; original loan #{item.loan_id}',branch=item.loan.member.branch)
        item.status='disbursed'; item.disbursed_by=request.user; item.resulting_loan=new_loan
        item.save(update_fields=['status','disbursed_by','resulting_loan','updated_at'])
        AuditLog.objects.create(user=request.user,action='loan_topup_disbursed',model_name='LoanTopUpRequest',object_id=str(item.pk),details={'original_loan_id':item.loan_id,'resulting_loan_id':new_loan.pk,'amount':str(item.amount),'journal_reference':reference})
        return Response(self.get_serializer(item).data,status=200)


class DepositAccountViewSet(SecureModelViewSet):
    queryset=DepositAccount.objects.select_related('member','created_by').all()
    serializer_class=DepositAccountSerializer
    http_method_names=['get','post','patch','put','head','options']
    def perform_create(self,serializer):
        import uuid
        # account_no is unique and the model is created before perform_create returns;
        # assign a unique value up front so concurrent requests never collide on ''.
        account=serializer.save(created_by=self.request.user,account_no=f'DEP-{uuid.uuid4().hex[:12].upper()}')
        AuditLog.objects.create(user=self.request.user,action='deposit_account_opened',model_name='DepositAccount',object_id=str(account.pk),details={'account_no':account.account_no,'member_id':account.member_id})
    def perform_update(self,serializer):
        account=self.get_object()
        if account.balance>0 and serializer.validated_data.get('status')=='closed':
            from rest_framework.exceptions import ValidationError
            raise ValidationError({'status':'A deposit account with a positive balance cannot be closed until a separately approved withdrawal workflow exists.'})
        serializer.save()


class DepositCollectionViewSet(SecureModelViewSet):
    queryset=DepositCollection.objects.select_related('account','account__member','created_by','approved_by').all()
    serializer_class=DepositCollectionSerializer
    http_method_names=['get','post','patch','put','head','options']
    def get_queryset(self):
        qs=super().get_queryset(); state=self.request.query_params.get('state')
        return qs.filter(status=state).order_by('-collection_date','-id') if state else qs.order_by('-collection_date','-id')
    def perform_create(self,serializer):
        import uuid
        item=serializer.save(created_by=self.request.user,journal_reference=f'DEP-COL-{uuid.uuid4().hex[:12].upper()}')
        AuditLog.objects.create(user=self.request.user,action='deposit_collection_submitted',model_name='DepositCollection',object_id=str(item.pk),details={'account_id':item.account_id,'amount':str(item.amount),'status':item.status})
    def perform_update(self,serializer):
        if self.get_object().status!='pending':
            from rest_framework.exceptions import ValidationError
            raise ValidationError({'status':'Only pending deposit collections can be edited.'})
        serializer.save()
    @action(detail=True,methods=['post'])
    @transaction.atomic
    def approve(self,request,pk=None):
        visible=self.get_object(); item=DepositCollection.objects.select_for_update().select_related('account','account__member').get(pk=visible.pk)
        if item.created_by_id==request.user.pk: return Response({'detail':'Maker-checker: collection creator cannot approve their own deposit collection.'},status=403)
        if item.status!='pending': return Response({'detail':'Only pending deposit collections can be approved.'},status=409)
        account=DepositAccount.objects.select_for_update().get(pk=item.account_id)
        if account.status!='active' or not account.member.active: return Response({'detail':'Deposit account and member must be active.'},status=400)
        if JournalEntry.objects.filter(reference=item.journal_reference).exists(): return Response({'detail':'Ledger reference already exists; manual review required.'},status=409)
        note,err=_approval_note(request)
        if err: return err
        source=f'Bank: {item.bank_account}' if item.method=='bank' else ('UPI clearing' if item.method=='upi' else 'Cash')
        account.balance=(account.balance+item.amount).quantize(Decimal('0.01'),ROUND_HALF_UP)
        account.save(update_fields=['balance','updated_at'])
        _post_pair(date=item.collection_date,debit_account=source,credit_account='Member Deposits Liability',amount=item.amount,reference=item.journal_reference,note=f'Deposit collection #{item.pk}; account {account.account_no}',branch=account.member.branch)
        item.status='approved'; item.approved_by=request.user; item.approved_at=timezone.now(); item.approval_note=note
        item.save(update_fields=['status','approved_by','approved_at','approval_note','updated_at'])
        AuditLog.objects.create(user=request.user,action='deposit_collection_approved',model_name='DepositCollection',object_id=str(item.pk),details={'account_no':account.account_no,'amount':str(item.amount),'journal_reference':item.journal_reference})
        return Response(self.get_serializer(item).data)
    @action(detail=True,methods=['post'])
    @transaction.atomic
    def reject(self,request,pk=None):
        visible=self.get_object(); item=DepositCollection.objects.select_for_update().get(pk=visible.pk)
        if item.created_by_id==request.user.pk: return Response({'detail':'Maker-checker: collection creator cannot reject their own deposit collection.'},status=403)
        if item.status!='pending': return Response({'detail':'Only pending deposit collections can be rejected.'},status=409)
        note,err=_approval_note(request,required=True)
        if err: return err
        item.status='rejected'; item.approved_by=request.user; item.approved_at=timezone.now(); item.approval_note=note
        item.save(update_fields=['status','approved_by','approved_at','approval_note','updated_at'])
        AuditLog.objects.create(user=request.user,action='deposit_collection_rejected',model_name='DepositCollection',object_id=str(item.pk),details={'reason':note})
        return Response(self.get_serializer(item).data)


class BranchViewSet(SecureModelViewSet): queryset=Branch.objects.all().order_by('name'); serializer_class=BranchSerializer
class AreaViewSet(SecureModelViewSet): queryset=Area.objects.select_related('branch').all().order_by('name'); serializer_class=AreaSerializer
class CentreViewSet(SecureModelViewSet): queryset=Centre.objects.select_related('area').all().order_by('name'); serializer_class=CentreSerializer
class GroupViewSet(SecureModelViewSet): queryset=Group.objects.select_related('centre').all().order_by('name'); serializer_class=GroupSerializer
class EmployeeViewSet(SecureModelViewSet): queryset=Employee.objects.select_related('branch').all().order_by('name'); serializer_class=EmployeeSerializer
class MemberViewSet(SecureModelViewSet):
    queryset=Member.objects.select_related('branch','area','centre','group','field_officer').all().order_by('-id')
    serializer_class=MemberSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        params = self.request.query_params
        search = (params.get('search') or params.get('q') or '').strip()
        if search:
            qs = qs.filter(
                Q(name__icontains=search) | Q(member_no__icontains=search) |
                Q(phone__icontains=search) | Q(email__icontains=search) |
                Q(address__icontains=search)
            )
        status_value = (params.get('status') or '').strip().lower()
        if status_value in {'active', 'inactive'}:
            qs = qs.filter(active=(status_value == 'active'))
        branch_id = params.get('branch')
        if branch_id and branch_id.isdigit():
            qs = qs.filter(branch_id=int(branch_id))
        officer_id = params.get('field_officer')
        if officer_id and officer_id.isdigit():
            qs = qs.filter(field_officer_id=int(officer_id))
        return qs
    @action(detail=False, methods=['post'], url_path='transfer')
    @transaction.atomic
    def transfer_members(self, request):
        """Audited, atomic customer reassignment; loans/installments stay linked to the member."""
        denied = _deny_unless_feature(request, 'manage_customers')
        if denied:
            return denied
        raw_ids = request.data.get('member_ids', [])
        if not isinstance(raw_ids, list) or not raw_ids:
            return Response({'detail': 'Select at least one customer to transfer.'}, status=400)
        try:
            ids = sorted({int(x) for x in raw_ids})
        except (TypeError, ValueError):
            return Response({'detail': 'Invalid customer selection.'}, status=400)
        target_branch_id = request.data.get('branch')
        target_officer_id = request.data.get('field_officer')
        if not target_branch_id or not target_officer_id:
            return Response({'detail': 'Target branch and field officer are required.'}, status=400)
        try:
            target_branch = Branch.objects.get(pk=target_branch_id, active=True)
            target_officer = Employee.objects.get(pk=target_officer_id, branch=target_branch)
        except (Branch.DoesNotExist, Employee.DoesNotExist, ValueError, TypeError):
            return Response({'detail': 'Choose an active branch and an employee assigned to that branch.'}, status=400)
        role = getattr(getattr(request.user, 'staff_profile', None), 'role', '')
        is_admin = request.user.is_superuser or role == 'admin'
        visible = list(self.get_queryset().select_for_update().filter(pk__in=ids))
        if len(visible) != len(ids):
            return Response({'detail': 'One or more selected customers are unavailable in your branch or do not exist.'}, status=404)
        source_branches = {m.branch_id for m in visible}
        cross_branch = any(branch_id != target_branch.id for branch_id in source_branches)
        reason=str(request.data.get('reason') or '').strip()
        if cross_branch and len(reason)<5:
            return Response({'reason':'A cross-branch customer transfer requires a reason of at least 5 characters.'},status=400)
        if not is_admin and cross_branch:
            return Response({'detail': 'Only Main Admin can transfer customers between branches.'}, status=403)
        # A branch user may reassign customers only to an agent in their own branch.
        if not is_admin and any(branch_id != target_branch.id for branch_id in source_branches):
            return Response({'detail': 'Cross-branch transfer requires Main Admin.'}, status=403)
        transferred = []
        for member in visible:
            old_branch_id, old_officer_id = member.branch_id, member.field_officer_id
            member.branch = target_branch
            member.field_officer = target_officer
            if member.branch_manager_id and not Employee.objects.filter(pk=member.branch_manager_id, branch=target_branch).exists():
                member.branch_manager = None
            member.save(update_fields=['branch', 'field_officer', 'branch_manager', 'updated_at'])
            AuditLog.objects.create(
                user=request.user, action='customer_transfer', model_name='Member',
                object_id=str(member.pk),
                details={'member_no': member.member_no, 'from_branch_id': old_branch_id,
                         'to_branch_id': target_branch.id, 'from_field_officer_id': old_officer_id,
                         'to_field_officer_id': target_officer.id, 'reason': reason[:250]}
            )
            transferred.append(member.pk)
        return Response({'detail': f'{len(transferred)} customer(s) transferred successfully.',
                         'transferred_ids': transferred, 'branch': target_branch.id,
                         'field_officer': target_officer.id})

class KycDocumentViewSet(SecureModelViewSet):
    queryset=KycDocument.objects.select_related('member','uploaded_by').all().order_by('-created_at')
    serializer_class=KycDocumentSerializer
    def get_queryset(self):
        qs=super().get_queryset()
        params=self.request.query_params
        member_id=params.get('member')
        if member_id and str(member_id).isdigit():
            qs=qs.filter(member_id=int(member_id))
        doc_type=(params.get('document_type') or '').strip()
        if doc_type:
            qs=qs.filter(document_type=doc_type)
        state=(params.get('status') or '').strip().lower()
        if state == 'verified':
            qs=qs.filter(verified=True)
        elif state in {'pending','rejected'}:
            # Legacy schema stores verification as a boolean; rejected documents are
            # represented by a non-empty review note prefixed with REJECTED:.
            qs=qs.filter(verified=False)
            if state == 'rejected':
                qs=qs.filter(verification_note__startswith='REJECTED:')
            else:
                qs=qs.exclude(verification_note__startswith='REJECTED:')
        search=(params.get('search') or '').strip()
        if search:
            qs=qs.filter(Q(member__name__icontains=search)|Q(member__member_no__icontains=search)|Q(original_name__icontains=search))
        return qs

    def _can_review(self, request):
        user=request.user
        profile=getattr(user,'staff_profile',None)
        return bool(user.is_staff or user.is_superuser or
                    (profile and profile.active and user.is_active and
                     (profile.permissions.get('verify_kyc',False) or profile.permissions.get('kyc_verify',False))))

    def perform_update(self,serializer):
        from rest_framework.exceptions import PermissionDenied
        if not self._can_review(self.request):
            raise PermissionDenied('The logged-in staff account does not have KYC verification permission.')
        # Do not let generic PATCH silently alter review state; use the explicit review actions.
        requested=set(self.request.data.keys())
        if requested.intersection({'verified','verification_note'}):
            raise PermissionDenied('Use the explicit verify or reject KYC action to review documents.')
        obj=serializer.save()
        AuditLog.objects.create(user=self.request.user,action='kyc_document_update',model_name='KycDocument',object_id=str(obj.pk),details={'updated_fields':sorted(requested)})

    @action(detail=True,methods=['post'],url_path='verify')
    def verify(self,request,pk=None):
        from rest_framework.exceptions import PermissionDenied
        if not self._can_review(request):
            raise PermissionDenied('The logged-in staff account does not have KYC verification permission.')
        doc=self.get_object()
        doc.verified=True
        doc.verification_note=''
        doc.save(update_fields=['verified','verification_note','updated_at'])
        AuditLog.objects.create(user=request.user,action='kyc_document_verified',model_name='KycDocument',object_id=str(doc.pk),details={'member_id':doc.member_id,'document_type':doc.document_type})
        return Response(self.get_serializer(doc).data)

    @action(detail=True,methods=['post'],url_path='reject')
    def reject(self,request,pk=None):
        from rest_framework.exceptions import PermissionDenied
        if not self._can_review(request):
            raise PermissionDenied('The logged-in staff account does not have KYC verification permission.')
        reason=str(request.data.get('reason') or '').strip()
        if len(reason)<5:
            return Response({'reason':'Rejection reason must be at least 5 characters.'},status=400)
        doc=self.get_object()
        doc.verified=False
        doc.verification_note='REJECTED: '+reason[:235]
        doc.save(update_fields=['verified','verification_note','updated_at'])
        AuditLog.objects.create(user=request.user,action='kyc_document_rejected',model_name='KycDocument',object_id=str(doc.pk),details={'member_id':doc.member_id,'document_type':doc.document_type,'reason':reason[:255]})
        return Response(self.get_serializer(doc).data)

    @action(detail=True,methods=["get"],url_path="download")
    def download(self,request,pk=None):
        doc=self.get_object()
        try:
            file_handle=doc.file.open("rb")
        except (FileNotFoundError, OSError):
            raise Http404("KYC document file not found.")
        response=FileResponse(file_handle,as_attachment=True,filename=doc.original_name or "kyc-document")
        response["X-Content-Type-Options"]="nosniff"
        response["Cache-Control"]="private, no-store"
        return response


def _calculate_loan_schedule_amounts(product, principal):
    """Single source of truth for the amounts displayed by plan previews and scheduled EMIs."""
    principal=Decimal(str(principal)).quantize(Decimal('0.01'),rounding=ROUND_HALF_UP)
    n=int(product.tenure)
    periods_per_year={'daily':Decimal('365'),'weekly':Decimal('52'),'fortnightly':Decimal('26'),'monthly':Decimal('12')}[product.frequency]
    if principal<=0 or n<1:
        raise ValueError('Principal and installment count must be positive.')
    if product.interest_method=='flat':
        interest=(principal*product.interest_rate/Decimal('100')*Decimal(n)/periods_per_year).quantize(Decimal('0.01'),ROUND_HALF_UP)
        p=(principal/Decimal(n)).quantize(Decimal('0.01'),rounding=ROUND_HALF_UP)
        i=(interest/Decimal(n)).quantize(Decimal('0.01'),rounding=ROUND_HALF_UP)
        rows=[(p,i) for _ in range(n)]
    else:
        rate=product.interest_rate/Decimal('100')/periods_per_year
        payment=(principal*rate/(1-(1+rate)**Decimal(-n))).quantize(Decimal('0.01'),ROUND_HALF_UP) if rate else (principal/Decimal(n)).quantize(Decimal('0.01'),ROUND_HALF_UP)
        balance=principal; rows=[]; interest=Decimal('0.00')
        for _ in range(n):
            intr=(balance*rate).quantize(Decimal('0.01'),ROUND_HALF_UP)
            pr=min(payment-intr,balance)
            rows.append((pr,intr)); interest+=intr; balance-=pr
    if rows:
        if product.interest_method=='flat':
            p_each=(principal/Decimal(n)).quantize(Decimal('0.01'),ROUND_HALF_UP)
            i_each=(interest/Decimal(n)).quantize(Decimal('0.01'),ROUND_HALF_UP)
            rows=[(p_each,i_each) for _ in range(n)]
            rows[-1]=(principal-sum((x[0] for x in rows[:-1]),Decimal('0.00')),interest-sum((x[1] for x in rows[:-1]),Decimal('0.00')))
        else:
            rows[-1]=(principal-sum((x[0] for x in rows[:-1]),Decimal('0.00')),interest-sum((x[1] for x in rows[:-1]),Decimal('0.00')))
    total=principal+interest
    return interest,total,rows


class LoanProductViewSet(SecureModelViewSet):
    queryset=LoanProduct.objects.all().order_by('name'); serializer_class=LoanProductSerializer
    def get_permissions(self):
        # All signed-in users may see plans for applications; only staff/admin may change them.
        if self.action in {'list','retrieve','preview'}:
            return [IsAuthenticated(),StaffFeaturePermission()]
        from rest_framework.permissions import IsAdminUser
        return [IsAuthenticated(), IsAdminUser()]

    @action(detail=True,methods=['post'],url_path='preview')
    def preview(self,request,pk=None):
        product=self.get_object()
        try:
            principal=Decimal(str(request.data.get('principal','0')))
            if not principal.is_finite() or principal<=0 or principal>Decimal('999999999999.99'):
                raise ValueError
            principal=principal.quantize(Decimal('0.01'),rounding=ROUND_HALF_UP)
            interest,total,rows=_calculate_loan_schedule_amounts(product,principal)
        except (InvalidOperation,TypeError,ValueError,ZeroDivisionError):
            return Response({'principal':'Enter a positive, finite amount within the supported INR range.'},status=status.HTTP_400_BAD_REQUEST)
        return Response({'product_id':product.pk,'product_name':product.name,'principal':str(principal),'interest_method':product.interest_method,'annual_interest_rate':str(product.interest_rate),'frequency':product.frequency,'tenure':product.tenure,'interest_total':str(interest),'total_payable':str(total),'suggested_emi':str((total/Decimal(product.tenure)).quantize(Decimal('0.01'),ROUND_HALF_UP)),'processing_fee':str(product.processing_fee),'installments':[{'number':i+1,'principal':str(p),'interest':str(intr),'total':str(p+intr)} for i,(p,intr) in enumerate(rows)],'preview_only':True,'note':'Preview only; this does not create an application, loan, schedule, disbursement or ledger entry.'})
class LoanApplicationViewSet(SecureModelViewSet):
    queryset=LoanApplication.objects.select_related('member','product').all().order_by('-id'); serializer_class=LoanApplicationSerializer
    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)
    @action(detail=True,methods=['post'])
    @transaction.atomic
    def approve(self,request,pk=None):
        # First resolve through the secured queryset so branch/object scoping is preserved,
        # then lock the application and member to serialize concurrent approval attempts.
        visible_app = self.get_object()
        app = LoanApplication.objects.select_for_update().select_related('member','product').get(pk=visible_app.pk)
        if app.created_by_id and app.created_by_id == request.user.pk:
            return Response({'detail':'Maker-checker: the application creator cannot approve their own application.'},status=403)
        if app.status == 'rejected':
            return Response({'detail':'A rejected application cannot be approved.'},status=400)
        existing_loan=Loan.objects.filter(application=app).first()
        if existing_loan:
            return Response(LoanSerializer(existing_loan).data)
        if app.status != 'pending':
            return Response({'detail':'Only a pending application can be approved.'},status=400)
        if not app.product.active:
            return Response({'detail':'Inactive loan products cannot be approved for new loans.'},status=400)
        if app.product.penalty_scheme_id and not app.product.penalty_scheme.active:
            return Response({'detail':'The selected Penalty Scheme is inactive. Configure an active scheme before approving new loans.'},status=400)
        if not app.member.active:
            return Response({'detail':'Inactive members cannot be approved.'},status=400)
        # Lock the member row before checking duplicate applications, preventing two
        # simultaneous requests from both passing the same pending-application check.
        Member.objects.select_for_update().get(pk=app.member_id)
        if LoanApplication.objects.filter(member=app.member,product=app.product,status='pending').exclude(pk=app.pk).exists():
            return Response({'detail':'Another pending application exists for this member and product.'},status=400)
        if _kyc_is_required():
            missing_kyc = _verified_kyc_gaps(app.member)
            if missing_kyc:
                return Response(_kyc_error_detail(missing_kyc, 'approval'), status=400)

        # Responsible-lending gate: use the newest assessment (not an older verified
        # record if a newer assessment is pending), require independent verification,
        # and reject stale or mathematically unsafe capacity assessments.
        assessment = HouseholdIncomeAssessment.objects.filter(member=app.member).order_by('-assessment_date', '-id').first()
        if assessment is None:
            return Response({'detail':'A verified household income and existing-debt assessment is required before loan approval.'}, status=400)
        if not assessment.verified or not assessment.verified_by_id or not assessment.verified_at:
            return Response({'detail':'The latest household assessment must be verified by a different authorized staff member before loan approval.'}, status=400)
        today = timezone.localdate()
        assessment_age = (today - assessment.assessment_date).days
        if assessment_age < 0 or assessment_age > 90:
            return Response({'detail':'The latest household assessment must be dated within the last 90 days.'}, status=400)
        if assessment.monthly_household_income <= 0:
            return Response({'detail':'Household monthly income must be greater than zero before loan approval.'}, status=400)
        # Repayment-obligation ratio is retained for assessment/reporting, but it does not block approval.

        max_income_multiple=getattr(app.product,'max_income_multiple',None)
        if max_income_multiple and app.requested_amount > app.member.household_income * max_income_multiple:
            return Response({'detail':'Requested amount exceeds the configured household-income limit.'},status=400)
        raw_approved_amount = request.data.get('approved_amount', app.requested_amount)
        try:
            approved_amount = Decimal(str(raw_approved_amount))
            if not approved_amount.is_finite():
                raise InvalidOperation
            cents = approved_amount.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
            if cents != approved_amount:
                return Response({'approved_amount':'Use at most two decimal places.'},status=400)
            approved_amount = cents
        except (InvalidOperation, TypeError, ValueError):
            return Response({'approved_amount':'Enter a valid finite approved amount.'},status=400)
        # Only the approver may choose the approved amount. Applicant-supplied fields
        # are read-only on the serializer and ignored for the decision.
        if approved_amount <= 0 or approved_amount > app.requested_amount:
            return Response({'approved_amount':'Approved amount must be greater than zero and cannot exceed the requested amount.'},status=400)
        decision_note=str(request.data.get('approval_note') or request.data.get('notes') or '').strip()
        app.status='approved'; app.approved_amount=approved_amount; app.approved_by=request.user
        app.save(update_fields=['status','approved_amount','approved_by','updated_at'])
        loan=Loan.objects.create(member=app.member,product=app.product,application=app,principal=approved_amount,status='approved',created_by=app.created_by or request.user,approved_by=request.user)
        AuditLog.objects.create(user=request.user,action='approve',model_name='LoanApplication',object_id=str(app.pk),details={'loan_id':loan.pk,'approval_note':decision_note})
        return Response(LoanSerializer(loan).data)
    @action(detail=True,methods=['post'])
    @transaction.atomic
    def reject(self,request,pk=None):
        visible=self.get_object()
        app=LoanApplication.objects.select_for_update().get(pk=visible.pk)
        note=str(request.data.get('notes') or request.data.get('reason') or '').strip()
        if len(note)<5: return Response({'reason':'Provide a rejection reason of at least 5 characters.'},status=400)
        if app.created_by_id and app.created_by_id == request.user.pk: return Response({'detail':'Maker-checker: the application creator cannot reject their own application.'},status=403)
        if app.status!='pending' or Loan.objects.filter(application=app).exists():
            return Response({'detail':'Only pending applications without a loan can be rejected; the decision has already been made.'},status=409)
        app.status='rejected'; app.notes=note
        app.save(update_fields=['status','notes','updated_at'])
        AuditLog.objects.create(user=request.user,action='loan_application_rejected',model_name='LoanApplication',object_id=str(app.pk),details={'reason':note})
        return Response(LoanApplicationSerializer(app).data)

class LoanViewSet(SecureModelViewSet):
    queryset=Loan.objects.select_related('member','product').all().order_by('-id'); serializer_class=LoanSerializer
    def create(self, request, *args, **kwargs):
        return Response({'detail':'Create a Loan Application first. A Loan record is created by the authorized application-approval workflow; direct loan creation is disabled to protect approval and disbursement controls.'},status=405)
    def _build_schedule(self,loan,start,*,first_due_on_start=False):
        product=loan.product; n=product.tenure; freq=product.frequency
        step={'daily':1,'weekly':7,'fortnightly':14,'monthly':30}[freq]
        principal=loan.principal
        # Use the same Decimal calculation as the read-only plan preview.
        interest,total,rows=_calculate_loan_schedule_amounts(product,principal)
        loan.interest_total=interest; loan.total_payable=total; loan.emi_amount=(total/Decimal(n)).quantize(Decimal('0.01'),ROUND_HALF_UP); loan.start_date=start; loan.save()
        # Never delete existing installment records from a financial workflow. Callers
        # must stop and reconcile a pre-existing schedule instead of silently replacing it.
        if loan.installments.exists():
            raise ValueError('An installment schedule already exists; refusing to replace financial records.')
        for idx,(p,i) in enumerate(rows,1):
            if freq == 'monthly':
                import calendar
                # An explicitly supplied EMI start date is the first due date.
                # When omitted, retain the conventional next-period schedule.
                month_index=(start.month-1)+(idx-1 if first_due_on_start else idx)
                year=start.year+month_index//12
                month=month_index%12+1
                due_day=min(start.day,calendar.monthrange(year,month)[1])
                from datetime import date as date_type
                due=date_type(year,month,due_day)
            else:
                due=start+timedelta(days=step*(idx-1 if first_due_on_start else idx))
            Installment.objects.create(loan=loan,number=idx,due_date=due,principal_due=p,interest_due=i)
    @action(detail=True,methods=['post'])
    @transaction.atomic
    def approve(self,request,pk=None):
        visible=self.get_object()
        loan=Loan.objects.select_for_update().select_related('member','product').get(pk=visible.pk)
        if loan.created_by_id == request.user.id:
            return Response({'detail':'Maker-checker: creator cannot approve this loan.'},status=403)
        if loan.status!='pending':
            return Response({'detail':'Only pending loans can be approved.'},status=409)
        if not loan.member.active:
            return Response({'detail':'Inactive members cannot be approved.'},status=400)
        if not loan.product.active:
            return Response({'detail':'Inactive loan products cannot be approved.'},status=400)
        if loan.product.penalty_scheme_id and not loan.product.penalty_scheme.active:
            return Response({'detail':'The linked penalty scheme is inactive.'},status=400)
        if _kyc_is_required():
            missing_kyc=_verified_kyc_gaps(loan.member)
            if missing_kyc:
                return Response(_kyc_error_detail(missing_kyc,'loan approval'),status=400)
        loan.status='approved'; loan.approved_by=request.user
        loan.save(update_fields=['status','approved_by','updated_at'])
        AuditLog.objects.create(user=request.user,action='loan_approved',model_name='Loan',object_id=str(loan.pk),details={'member_id':loan.member_id,'principal':str(loan.principal)})
        return Response(self.get_serializer(loan).data)
    @action(detail=True,methods=['post'])
    @transaction.atomic
    def disburse(self,request,pk=None):
        visible=self.get_object()
        loan=Loan.objects.select_for_update().select_related('member','product').get(pk=visible.pk)
        raw_amount=request.data.get('amount',loan.principal)
        try:
            amount=Decimal(str(raw_amount))
            if not amount.is_finite():
                raise InvalidOperation
        except (InvalidOperation,TypeError,ValueError):
            return Response({'amount':'Enter a valid finite monetary amount.'},status=400)
        date=request.data.get('date') or timezone.localdate()
        explicit_emi_start=bool(request.data.get('emi_start_date'))
        emi_start_date=request.data.get('emi_start_date') or date
        if loan.status == 'disbursed' and hasattr(loan, 'disbursement'):
            return Response(self.get_serializer(loan).data)
        # Disbursement is a financial boundary: pending loans must never be paid out.
        # Approval is a separate workflow and must have completed successfully first.
        if loan.status != 'approved':
            return Response({'detail':'Loan must be approved before disbursement. Pending loans cannot be disbursed.'},status=400)
        if not loan.member.active:
            return Response({'detail':'Inactive members cannot receive a loan disbursement.'},status=400)
        if not loan.product.active:
            return Response({'detail':'Inactive loan products cannot be disbursed.'},status=400)
        if loan.installments.exists():
            return Response({'detail':'This loan already has an installment schedule. Disbursement was stopped to avoid replacing existing schedule records; review the loan manually.'},status=409)
        if loan.approved_by_id == request.user.id or loan.created_by_id == request.user.id:
            return Response({'detail':'Maker-checker: creator/approver cannot disburse this loan.'},status=403)
        if _kyc_is_required():
            missing_kyc = _verified_kyc_gaps(loan.member)
            if missing_kyc:
                return Response(_kyc_error_detail(missing_kyc, 'disbursement'), status=400)
        if amount <= 0 or amount != loan.principal:
            return Response({'detail':'Disbursement amount must be positive and match the approved loan principal. Change the approved principal before disbursement.'},status=400)
        method=request.data.get('method','bank')
        bank_account=str(request.data.get('bank_account') or '').strip()[:120]
        if method == 'bank' and not bank_account:
            return Response({'bank_account':'Select or enter the company bank account used for this disbursement.'},status=400)
        if method not in {'bank','cash'}:
            return Response({'method':'Choose Bank A/C or Cash for loan disbursement.'},status=400)
        source_account=(f'Bank: {bank_account}' if method == 'bank' else 'Cash')
        # Parse both dates explicitly so malformed client input returns a 400 instead
        # of surfacing as an unhandled server error during a real-money operation.
        from django.utils.dateparse import parse_date
        from datetime import date as date_type
        try:
            if isinstance(date, str):
                parsed_disbursed_date=parse_date(date)
                if parsed_disbursed_date is None:
                    raise ValueError
                date=parsed_disbursed_date
            if isinstance(emi_start_date, str):
                schedule_start=parse_date(emi_start_date)
                if schedule_start is None:
                    raise ValueError
            elif isinstance(emi_start_date, date_type):
                schedule_start=emi_start_date
            else:
                raise ValueError
        except (TypeError, ValueError):
            return Response({'date':'Enter valid dates in YYYY-MM-DD format for disbursement and first EMI.'},status=400)
        if schedule_start < date:
            return Response({'emi_start_date':'The first EMI date cannot be earlier than the disbursement date.'},status=400)
        reference=str(request.data.get('reference') or f'DISB-LOAN-{loan.pk}').strip()
        if not reference:
            return Response({'reference':'A unique disbursement reference is required.'},status=400)
        if JournalEntry.objects.filter(reference__iexact=reference).exists():
            return Response({'detail':'This reference is already used in the ledger. Use a unique disbursement reference; no loan changes were made.'},status=409)
        # Check funds before mutating loan status or creating installments. Returning a
        # 400 Response inside atomic() does not roll a transaction back by itself.
        available=_ledger_balance(source_account, branch=loan.member.branch_id, branch_scoped=True)
        if available < amount:
            return Response({'detail':f'Insufficient available balance in {source_account}. Available: {available:.2f}; required: {amount:.2f}. Add/record funds or choose the correct source account.'},status=400)
        self._build_schedule(loan,schedule_start,first_due_on_start=explicit_emi_start)
        loan.status='disbursed'; loan.disbursed_on=date; loan.disbursed_by=request.user; loan.save(update_fields=['status','disbursed_on','disbursed_by','updated_at'])
        Disbursement.objects.update_or_create(loan=loan,defaults={'amount':amount,'date':date,'method':method,'bank_account':bank_account,'reference':reference,'status':'success'})
        _post_pair(date=date,debit_account='Loans Receivable',credit_account=source_account,amount=amount,reference=reference,note=f'Loan disbursement #{loan.pk}',branch=loan.member.branch)
        AuditLog.objects.create(user=request.user,action='disburse',model_name='Loan',object_id=str(loan.pk),details={'amount':str(amount),'journal_reference':reference})
        return Response(self.get_serializer(loan).data)
    @action(detail=True,methods=['get'])
    def schedule(self,request,pk=None): return Response(InstallmentSerializer(self.get_object().installments.all(),many=True).data)
    @action(detail=True,methods=['post'])
    def close(self,request,pk=None):
        loan=self.get_object()
        if loan.status == 'closed':
            return Response(self.get_serializer(loan).data)
        if loan.status != 'disbursed':
            return Response({'detail':'Only a disbursed loan can be closed.'},status=400)
        unpaid=loan.installments.exclude(status='paid').exists()
        if unpaid:
            return Response({'detail':'Loan cannot be closed while installments remain unpaid. Use the collection/foreclosure workflow.'},status=400)
        loan.status='closed'; loan.save(update_fields=['status','updated_at'])
        AuditLog.objects.create(user=request.user,action='close_loan',model_name='Loan',object_id=str(loan.pk),details={})
        return Response(self.get_serializer(loan).data)

    @action(detail=True,methods=['get','post'])
    @transaction.atomic
    def foreclose(self,request,pk=None):
        # Quote or post early closure using remaining scheduled principal + interest + penalties.
        # This requested formula does not discount future interest; confirm policy with compliance.
        # Resolve through the scoped queryset first; querying the model directly here
        # would let a branch user foreclose another branch's loan by guessing its ID.
        visible = self.get_object()
        loan=Loan.objects.select_for_update().filter(pk=visible.pk).first()
        if loan is None:
            return Response({'detail':'Loan not found.'},status=404)
        if loan.status == 'closed':
            key=str(request.data.get('idempotency_key') or '').strip() if request.method == 'POST' else ''
            existing=(Payment.objects.filter(loan=loan,idempotency_key=key).first() if key else None)
            if existing and existing.status=='success':
                # A retry is idempotent only for the same transaction. Reusing a key
                # with a different amount/method/account/date must not return a false success.
                try:
                    requested_amount=Decimal(str(request.data.get('amount',existing.amount)))
                    if not requested_amount.is_finite(): raise InvalidOperation
                    requested_amount=requested_amount.quantize(Decimal('0.01'),ROUND_HALF_UP)
                except (InvalidOperation,TypeError,ValueError):
                    return Response({'amount':'Enter a valid finite amount for the retry.'},status=400)
                requested_method=str(request.data.get('method') or existing.method).strip().lower()
                requested_bank=str(request.data.get('bank_account') or existing.bank_account).strip()[:120]
                requested_reference=str(request.data.get('reference') or existing.reference).strip()[:120]
                requested_date=request.data.get('paid_on') or existing.paid_on
                if isinstance(requested_date,str):
                    from django.utils.dateparse import parse_date
                    requested_date=parse_date(requested_date)
                if (existing.loan_id==loan.pk and existing.amount==requested_amount and existing.method==requested_method and existing.bank_account==requested_bank and existing.reference==requested_reference and existing.paid_on==requested_date):
                    return Response({'loan':loan.pk,'status':'closed','receipt_no':existing.receipt_no,'foreclosure_amount':str(existing.amount)},status=200)
                return Response({'detail':'This idempotency key was already used for a different foreclosure transaction.'},status=409)
            existing=Payment.objects.filter(loan=loan,idempotency_key__startswith=f'FORECLOSE-{loan.pk}-').order_by('-id').first()
            return Response({'loan':loan.pk,'status':'closed','receipt_no':existing.receipt_no if existing else None,'foreclosure_amount':str(existing.amount) if existing else '0.00'})
        if loan.status != 'disbursed':
            return Response({'detail':'Only a disbursed loan can be foreclosed.'},status=400)
        installments=list(loan.installments.select_for_update().order_by('number'))
        outstanding=Decimal('0.00')
        for inst in installments:
            outstanding += max(Decimal('0'),inst.principal_due-inst.principal_paid)
            outstanding += max(Decimal('0'),inst.interest_due-inst.interest_paid)
            outstanding += max(Decimal('0'),inst.penalty_due-inst.penalty_paid)
        outstanding=outstanding.quantize(Decimal('0.01'),ROUND_HALF_UP)
        if request.method == 'GET':
            return Response({'loan':loan.pk,'status':loan.status,'outstanding_amount':str(outstanding),'formula':'remaining scheduled principal + remaining scheduled interest + unpaid penalties','interest_discounted':False})
        if outstanding <= 0:
            loan.status='closed'; loan.save(update_fields=['status','updated_at'])
            return Response({'loan':loan.pk,'status':'closed','foreclosure_amount':'0.00','detail':'No outstanding dues remain.'})
        try:
            raw_amount=Decimal(str(request.data.get('amount','0')))
            if not raw_amount.is_finite():
                raise InvalidOperation
            amount=raw_amount.quantize(Decimal('0.01'),ROUND_HALF_UP)
            if amount != raw_amount:
                return Response({'amount':'Use at most two decimal places.'},status=400)
        except (InvalidOperation,TypeError,ValueError):
            return Response({'amount':'Enter a valid finite amount.'},status=400)
        if amount != outstanding:
            return Response({'amount':f'Foreclosure amount must exactly match the current quote of {outstanding}.'},status=400)
        key=str(request.data.get('idempotency_key') or '').strip()
        if not key:
            return Response({'idempotency_key':'Required for safe foreclosure retries.'},status=400)
        method=str(request.data.get('method','cash')).strip().lower()
        if method not in dict(Payment.METHOD):
            return Response({'method':'Choose cash, UPI, bank, card or gateway.'},status=400)
        bank_account=str(request.data.get('bank_account') or '').strip()[:120]
        if method == 'bank' and not bank_account:
            return Response({'bank_account':'Select the company bank account receiving the foreclosure payment.'},status=400)
        paid_on=request.data.get('paid_on') or timezone.localdate()
        if isinstance(paid_on,str):
            from django.utils.dateparse import parse_date
            paid_on=parse_date(paid_on)
        if not paid_on:
            return Response({'paid_on':'Enter a valid ISO date.'},status=400)
        reference=str(request.data.get('reference') or f'FORECLOSE-{loan.pk}-{key[:20]}')[:120]
        existing=Payment.objects.filter(idempotency_key=key).first()
        if existing:
            same=(existing.loan_id==loan.pk and existing.amount==amount and existing.status=='success' and existing.method==method and existing.bank_account==bank_account and existing.paid_on==paid_on and existing.reference==reference)
            if same:
                return Response({'loan':loan.pk,'status':loan.status,'receipt_no':existing.receipt_no,'foreclosure_amount':str(existing.amount)},status=200)
            return Response({'detail':'This idempotency key was already used for a different payment.'},status=409)
        payment=Payment.objects.create(member=loan.member,loan=loan,receipt_no=f'RCT-FC-{timezone.now().strftime("%Y%m%d%H%M%S%f")}',amount=amount,method=method,bank_account=bank_account,reference=reference,idempotency_key=key,paid_on=paid_on,status='success')
        principal=Decimal('0.00'); interest=Decimal('0.00'); penalty=Decimal('0.00')
        for inst in installments:
            p_due=max(Decimal('0'),inst.principal_due-inst.principal_paid)
            i_due=max(Decimal('0'),inst.interest_due-inst.interest_paid)
            pen_due=max(Decimal('0'),inst.penalty_due-inst.penalty_paid)
            principal+=p_due; interest+=i_due; penalty+=pen_due
            inst.principal_paid+=p_due; inst.interest_paid+=i_due; inst.penalty_paid+=pen_due; inst.status='paid'; inst.save()
        ref=payment.reference or payment.receipt_no
        if principal: _post_pair(date=paid_on,debit_account=_money_account(method,bank_account),credit_account='Loans Receivable',amount=principal,reference=ref,note=f'Foreclosure principal receipt {payment.receipt_no}',branch=loan.member.branch)
        if interest: _post_pair(date=paid_on,debit_account=_money_account(method,bank_account),credit_account='Interest Income',amount=interest,reference=ref,note=f'Foreclosure interest receipt {payment.receipt_no}',branch=loan.member.branch)
        if penalty: _post_pair(date=paid_on,debit_account=_money_account(method,bank_account),credit_account='Penalty Income',amount=penalty,reference=ref,note=f'Foreclosure penalty receipt {payment.receipt_no}',branch=loan.member.branch)
        loan.status='closed'; loan.save(update_fields=['status','updated_at'])
        AuditLog.objects.create(user=request.user,action='foreclose_loan',model_name='Loan',object_id=str(loan.pk),details={'receipt_no':payment.receipt_no,'amount':str(amount),'principal':str(principal),'interest':str(interest),'penalty':str(penalty),'idempotency_key':key})
        return Response({'loan':loan.pk,'status':'closed','receipt_no':payment.receipt_no,'foreclosure_amount':str(amount)},status=201)

class PromiseToPayViewSet(SecureModelViewSet):
    queryset=PromiseToPay.objects.select_related('loan','member').all().order_by('-promised_date','-id')
    serializer_class=PromiseToPaySerializer
    def perform_create(self,serializer): serializer.save(created_by=self.request.user)
    def get_queryset(self):
        qs=super().get_queryset(); state=self.request.query_params.get('state')
        if state: qs=qs.filter(status=state)
        return qs
    @action(detail=True,methods=['post'])
    def outcome(self,request,pk=None):
        item=self.get_object(); status_value=str(request.data.get('status',''))
        if status_value not in {'kept','broken','cancelled'}:
            return Response({'status':'Choose kept, broken, or cancelled.'},status=400)
        if item.status!='promised': return Response({'detail':'Only an open promise can be updated.'},status=409)
        item.status=status_value
        if 'follow_up_note' in request.data: item.follow_up_note=str(request.data.get('follow_up_note') or '')[:4000]
        item.save(update_fields=['status','follow_up_note','updated_at'])
        AuditLog.objects.create(user=request.user,action='promise_to_pay_outcome',model_name='PromiseToPay',object_id=str(item.pk),details={'status':status_value})
        return Response(self.get_serializer(item).data)

class SettlementCaseViewSet(SecureModelViewSet):
    queryset=SettlementCase.objects.select_related('loan','member').all().order_by('-created_at','-id')
    serializer_class=SettlementCaseSerializer
    def get_queryset(self):
        qs=super().get_queryset(); state=self.request.query_params.get('state')
        if state: qs=qs.filter(status=state)
        return qs
    def perform_create(self,serializer):
        loan=serializer.validated_data['loan']
        outstanding=loan.installments.aggregate(p=Sum('principal_due'),i=Sum('interest_due'),pen=Sum('penalty_due'),pp=Sum('principal_paid'),ip=Sum('interest_paid'),penp=Sum('penalty_paid'))
        total=max(Decimal('0'),(outstanding['p'] or Decimal('0'))-(outstanding['pp'] or Decimal('0'))+(outstanding['i'] or Decimal('0'))-(outstanding['ip'] or Decimal('0'))+(outstanding['pen'] or Decimal('0'))-(outstanding['penp'] or Decimal('0')))
        proposed=serializer.validated_data['proposed_amount']
        if total<=0 or loan.status in {'closed','rejected','draft'}:
            from rest_framework.exceptions import ValidationError
            raise ValidationError({'loan':'This loan has no eligible outstanding balance for settlement.'})
        if proposed>total:
            from rest_framework.exceptions import ValidationError
            raise ValidationError({'proposed_amount':f'Settlement offer cannot exceed current scheduled outstanding ({total:.2f}).'})
        serializer.save(created_by=self.request.user,outstanding_snapshot=total,discount_amount=total-proposed)
    @action(detail=True,methods=['post'])
    @transaction.atomic
    def approve(self,request,pk=None):
        visible=self.get_object()
        item=SettlementCase.objects.select_for_update().get(pk=visible.pk)
        if not _is_approval_manager(request.user):
            return Response({'detail':'Only an authorized manager can approve settlement.'},status=403)
        if item.created_by_id and item.created_by_id==request.user.pk:
            return Response({'detail':'Maker-checker: the settlement creator cannot approve their own settlement.'},status=403)
        if item.status!='pending': return Response({'detail':'Only pending settlements can be approved.'},status=409)
        # Recalculate under the locked settlement row: the outstanding can change
        # after the request was created, so approving a stale discount is unsafe.
        loan=Loan.objects.select_for_update().get(pk=item.loan_id)
        if not item.member.active:
            return Response({'detail':'Inactive members cannot receive settlement approval.'},status=400)
        if loan.status not in {'disbursed','restructured'}:
            return Response({'detail':'Settlement approval requires an active disbursed loan.'},status=400)
        current=loan.installments.aggregate(p=Sum('principal_due'),i=Sum('interest_due'),pen=Sum('penalty_due'),pp=Sum('principal_paid'),ip=Sum('interest_paid'),penp=Sum('penalty_paid'))
        current_outstanding=max(Decimal('0'),(current['p'] or Decimal('0'))-(current['pp'] or Decimal('0'))+(current['i'] or Decimal('0'))-(current['ip'] or Decimal('0'))+(current['pen'] or Decimal('0'))-(current['penp'] or Decimal('0')))
        if current_outstanding<=0:
            return Response({'detail':'Loan has no remaining outstanding balance; settlement approval is not applicable.'},status=409)
        if current_outstanding != item.outstanding_snapshot:
            return Response({'detail':'Loan outstanding changed since this settlement was requested. Cancel/recreate the settlement using the current balance before approval.','requested_outstanding':str(item.outstanding_snapshot),'current_outstanding':str(current_outstanding)},status=409)
        if item.proposed_amount<=0 or item.proposed_amount>current_outstanding:
            return Response({'detail':'Settlement amount must be positive and cannot exceed current outstanding.'},status=400)
        note=str(request.data.get('approval_note') or '').strip()
        item.status='approved'; item.approval_note=note; item.approved_by=request.user; item.approved_at=timezone.now()
        item.save(update_fields=['status','approval_note','approved_by','approved_at','updated_at'])
        AuditLog.objects.create(user=request.user,action='settlement_approved',model_name='SettlementCase',object_id=str(item.pk),details={'loan':item.loan_id,'outstanding_snapshot':str(item.outstanding_snapshot),'proposed_amount':str(item.proposed_amount),'discount_amount':str(item.discount_amount),'note':note})
        return Response(self.get_serializer(item).data)
    @action(detail=True,methods=['post'])
    @transaction.atomic
    def reject(self,request,pk=None):
        visible=self.get_object()
        item=SettlementCase.objects.select_for_update().get(pk=visible.pk)
        if not _is_approval_manager(request.user): return Response({'detail':'Only an authorized manager can reject settlement.'},status=403)
        if item.created_by_id and item.created_by_id==request.user.pk: return Response({'detail':'Maker-checker: the settlement creator cannot reject their own settlement.'},status=403)
        if item.status!='pending': return Response({'detail':'Only pending settlements can be rejected.'},status=409)
        note,err=_approval_note(request,required=True)
        if err: return err
        item.status='rejected'; item.approval_note=note; item.approved_by=request.user; item.approved_at=timezone.now()
        item.save(update_fields=['status','approval_note','approved_by','approved_at','updated_at'])
        AuditLog.objects.create(user=request.user,action='settlement_rejected',model_name='SettlementCase',object_id=str(item.pk),details={'loan':item.loan_id,'note':item.approval_note})
        return Response(self.get_serializer(item).data)

class InstallmentViewSet(SecureModelViewSet):
    # Installment principal/interest due and paid fields drive loan balances. They must
    # not be directly created/edited/deleted through generic CRUD; use loan and payment workflows.
    http_method_names=['get','head','options']
    queryset=Installment.objects.select_related('loan').all(); serializer_class=InstallmentSerializer
    def get_queryset(self):
        qs=super().get_queryset(); state=self.request.query_params.get('state')
        if state=='paid': qs=qs.filter(status='paid')
        elif state=='due': qs=qs.exclude(status='paid').filter(due_date__lte=timezone.localdate())
        return qs.order_by('due_date','id')
class DisbursementViewSet(viewsets.ReadOnlyModelViewSet):
    permission_classes=[IsAuthenticated,StaffFeaturePermission]
    queryset=Disbursement.objects.select_related('loan','loan__member').all().order_by('-date','-id')
    serializer_class=DisbursementSerializer
    def get_queryset(self):
        qs=super().get_queryset(); user=self.request.user
        if user.is_superuser: return qs
        profile=getattr(user,'staff_profile',None)
        if profile is None: return qs if user.is_staff else qs.none()
        if profile.role=='admin': return qs
        if not profile.active or not profile.branch_id: return qs.none()
        return qs.filter(loan__member__branch_id=profile.branch_id)
class PaymentViewSet(SecureModelViewSet):
    @action(detail=True, methods=['post'], url_path='reverse')
    def reverse(self, request, pk=None):
        """Submit a payment reversal for independent maker-checker approval."""
        reason=str(request.data.get('reason') or '').strip()
        if len(reason)<5:
            return Response({'reason':'Provide a reversal reason of at least 5 characters.'},status=400)
        key=str(request.data.get('idempotency_key') or '').strip() or None
        with transaction.atomic():
            visible=self.get_object()  # branch-scoped lookup
            payment=Payment.objects.select_for_update().get(pk=visible.pk)
            if payment.status!='success' or payment.is_reversed:
                return Response({'detail':'Only successful, unreversed payments can be submitted for reversal.'},status=409)
            existing=PaymentReversalRequest.objects.filter(payment=payment,status='pending').first()
            if existing:
                if existing.created_by_id==request.user.pk and existing.reason==reason:
                    return Response({'id':existing.pk,'status':existing.status,'detail':'Existing pending reversal request returned.'},status=200)
                return Response({'detail':'A reversal request is already pending for this payment.'},status=409)
            if key:
                retry=PaymentReversalRequest.objects.filter(idempotency_key=key).first()
                if retry:
                    if retry.payment_id==payment.pk and retry.created_by_id==request.user.pk and retry.reason==reason:
                        return Response(PaymentReversalRequestSerializer(retry).data,status=200)
                    return Response({'detail':'Idempotency key already belongs to another request.'},status=409)
            item=PaymentReversalRequest.objects.create(payment=payment,reason=reason,idempotency_key=key,created_by=request.user)
            AuditLog.objects.create(user=request.user,action='payment_reversal_requested',model_name='PaymentReversalRequest',object_id=str(item.pk),details={'payment_id':payment.pk,'receipt_no':payment.receipt_no,'reason':reason})
        return Response(PaymentReversalRequestSerializer(item).data,status=202)

    def create(self, request, *args, **kwargs):
        # Safe retry support: a client must reuse the same key for the same payment.
        # Return the original receipt on retry rather than allocating the EMI twice.
        key = str(request.data.get('idempotency_key') or '').strip()
        if key:
            # Respect branch scoping on retry; never return another branch's receipt
            # merely because a caller guesses or reuses its idempotency key.
            existing = self.get_queryset().filter(idempotency_key=key).first()
            if existing:
                comparable = {
                    'member': str(existing.member_id),
                    'loan': str(existing.loan_id or ''),
                    'amount': str(Decimal(existing.amount).quantize(Decimal('0.01'))),
                    'method': existing.method,
                    'reference': existing.reference,
                    'bank_account': existing.bank_account,
                    'paid_on': str(existing.paid_on),
                    'status': existing.status,
                }
                # Validate the raw amount before Decimal conversion. A malformed amount
                # must produce a normal API 400, not an uncaught InvalidOperation/500.
                try:
                    incoming_amount = Decimal(str(request.data.get('amount', '0')))
                    if not incoming_amount.is_finite():
                        raise InvalidOperation
                    incoming_amount = incoming_amount.quantize(Decimal('0.01'))
                except (InvalidOperation, TypeError, ValueError):
                    from rest_framework.exceptions import ValidationError
                    raise ValidationError({'amount': 'Enter a valid finite monetary amount.'})
                incoming = {
                    'member': str(request.data.get('member', '')),
                    'loan': str(request.data.get('loan') or ''),
                    'amount': str(incoming_amount),
                    'method': str(request.data.get('method', '')),
                    'reference': str(request.data.get('reference', '') or ''),
                    'bank_account': str(request.data.get('bank_account', '') or ''),
                    'paid_on': str(request.data.get('paid_on') or existing.paid_on),
                    'status': str(_effective_collection_status(request.user,str(request.data.get('status') or 'success'))),
                }
                if comparable != incoming:
                    return Response({'detail':'This idempotency_key was already used for a different payment.'}, status=409)
                return Response(self.get_serializer(existing).data, status=200)
            if Payment.objects.filter(idempotency_key=key).exists():
                return Response({'detail':'This idempotency_key is already in use; check the original branch/receipt before retrying.'},status=409)
        return super().create(request, *args, **kwargs)

    def get_permissions(self):
        return [IsAuthenticated(), StaffFeaturePermission()]
    queryset=Payment.objects.select_related('member','loan').all().order_by('-paid_on','-id'); serializer_class=PaymentSerializer
    def get_queryset(self):
        qs=super().get_queryset()
        requested=self.request.query_params.get('status')
        if requested in {'pending','success','rejected','failed','refunded','reversed'}:
            qs=qs.filter(status=requested)
        return qs
    http_method_names=['get','post','head','options']  # Financial receipts are immutable; corrections require a reversal workflow.
    def perform_create(self,serializer):
        from rest_framework.exceptions import ValidationError
        with transaction.atomic():
            requested_status=serializer.validated_data.get('status','success')
            # Prevent API callers from bypassing approval and apply the same setting
            # during idempotency checks, so identical retries return the saved receipt.
            effective_status=_effective_collection_status(self.request.user,requested_status)
            if effective_status in {'pending','success'} and not serializer.validated_data.get('loan'):
                raise ValidationError({'loan':'An EMI collection must be linked to a specific loan.'})
            p=serializer.save(status=effective_status,receipt_no=serializer.validated_data.get('receipt_no') or f'RCT-{timezone.now().strftime("%Y%m%d%H%M%S%f")}',created_by=self.request.user)
            if p.status=='success':
                allocated=_post_successful_collection(p,user=self.request.user,require_loan=True)
                action_name='collection_auto_approved' if requested_status=='pending' else 'collect_payment'
            elif p.status=='pending':
                allocated={'principal':'0.00','interest':'0.00','penalty':'0.00'}
                action_name='collection_submitted_for_approval'
            else:
                allocated={'principal':'0.00','interest':'0.00','penalty':'0.00'}
                action_name='collection_recorded_without_posting'
            AuditLog.objects.create(user=self.request.user,action=action_name,model_name='Payment',object_id=str(p.pk),details={'amount':str(p.amount),'requested_status':requested_status,'status':p.status,'principal_allocated':allocated['principal'],'interest_allocated':allocated['interest'],'penalty_allocated':allocated['penalty'],'method':p.method,'bank_account':p.bank_account,'ledger_account':_money_account(p.method,p.bank_account) if p.status=='success' else '', 'created_by':self.request.user.pk})

    @action(detail=True,methods=['post'])
    @transaction.atomic
    def approve(self,request,pk=None):
        item=Payment.objects.select_for_update().get(pk=self.get_object().pk)  # Lock only Payment; nullable loan/member joins break PostgreSQL FOR UPDATE.
        if not _is_approval_manager(request.user):
            return Response({'detail':'Only an authorized finance manager can approve collections.'},status=403)
        if item.created_by_id and item.created_by_id==request.user.pk:
            return Response({'detail':'Maker-checker: the collection creator cannot approve their own collection.'},status=403)
        if item.status!='pending':
            return Response({'detail':'Only pending collections can be approved; no ledger entries were changed.'},status=409)
        note,err=_approval_note(request)
        if err: return err
        item.status='success'
        allocated=_post_successful_collection(item,user=request.user,require_loan=True)
        item.approved_by=request.user; item.approved_at=timezone.now(); item.approval_note=note
        item.save(update_fields=['status','approved_by','approved_at','approval_note','updated_at'])
        AuditLog.objects.create(user=request.user,action='collection_approved',model_name='Payment',object_id=str(item.pk),details={'receipt_no':item.receipt_no,'amount':str(item.amount),'principal_allocated':allocated['principal'],'interest_allocated':allocated['interest'],'penalty_allocated':allocated['penalty'],'approval_note':note})
        return Response(self.get_serializer(item).data)

    @action(detail=True,methods=['post'])
    @transaction.atomic
    def reject(self,request,pk=None):
        item=Payment.objects.select_for_update().get(pk=self.get_object().pk)
        if not _is_approval_manager(request.user):
            return Response({'detail':'Only an authorized finance manager can reject collections.'},status=403)
        if item.created_by_id and item.created_by_id==request.user.pk:
            return Response({'detail':'Maker-checker: the collection creator cannot reject their own collection.'},status=403)
        if item.status!='pending':
            return Response({'detail':'Only pending collections can be rejected.'},status=409)
        note,err=_approval_note(request,required=True)
        if err: return err
        item.status='rejected'; item.approval_note=note; item.approved_by=request.user; item.approved_at=timezone.now()
        item.save(update_fields=['status','approval_note','approved_by','approved_at','updated_at'])
        AuditLog.objects.create(user=request.user,action='collection_rejected',model_name='Payment',object_id=str(item.pk),details={'receipt_no':item.receipt_no,'amount':str(item.amount),'reason':note})
        return Response(self.get_serializer(item).data)

class CapitalEntryViewSet(SecureModelViewSet):
    # Capital entries post accounting on create; edits/deletes would leave the ledger stale.
    http_method_names=['get','post','head','options']
    queryset=CapitalEntry.objects.all().order_by('-date','-id'); serializer_class=CapitalEntrySerializer
    @transaction.atomic
    def perform_create(self,serializer):
        # Branch staff cannot assign capital movements to another branch.
        assigned=_staff_branch_id(self.request.user)
        proposed=serializer.validated_data
        selected_branch=proposed.get('branch')
        if assigned is False:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('An active branch assignment or organization administrator account is required.')
        if assigned is not None:
            if selected_branch is not None and selected_branch.pk!=assigned:
                from rest_framework.exceptions import PermissionDenied
                raise PermissionDenied('Capital entries may only be posted to the assigned branch.')
            proposed['branch']=Branch.objects.get(pk=assigned)
        proposed_reference=str(proposed.get('reference') or '').strip()
        if proposed_reference and JournalEntry.objects.filter(reference__iexact=proposed_reference).exists():
            from rest_framework.exceptions import ValidationError
            raise ValidationError({'reference':'This reference is already used in the ledger. Use a unique reference for each capital transaction.'})
        if proposed.get('kind')=='out':
            bank_name=(proposed.get('bank_account') or '').strip()
            source_account=f'Bank: {bank_name}' if bank_name else 'Cash'
            amount=Decimal(str(proposed.get('amount') or '0'))
            available=_ledger_balance(source_account, branch=proposed.get('branch').pk if proposed.get('branch') else None, branch_scoped=True)
            if amount <= 0:
                from rest_framework.exceptions import ValidationError
                raise ValidationError({'amount':'Amount must be greater than zero.'})
            if amount > available:
                from rest_framework.exceptions import ValidationError
                raise ValidationError({'amount':f'Insufficient available balance in {source_account}. Available: {available:.2f}; requested: {amount:.2f}.'})
        entry=serializer.save(created_by=self.request.user)
        ref=entry.reference or f'CAP-{entry.pk}'
        account=(f'Bank: {entry.bank_account.strip()}' if entry.bank_account and entry.bank_account.strip() else 'Cash')
        if entry.kind=='in':
            _post_pair(date=entry.date,debit_account=account,credit_account='Capital',amount=entry.amount,reference=ref,note='Capital contribution',branch=entry.branch)
        else:
            _post_pair(date=entry.date,debit_account='Capital',credit_account=account,amount=entry.amount,reference=ref,note='Capital withdrawal',branch=entry.branch)
class ExpenseViewSet(SecureModelViewSet):
    # Expenses post journal entries on create; corrections require an explicit reversal.
    http_method_names=['get','post','head','options']
    queryset=Expense.objects.select_related('branch').all().order_by('-date','-id'); serializer_class=ExpenseSerializer
    @transaction.atomic
    def perform_create(self,serializer):
        proposed=serializer.validated_data
        assigned=_staff_branch_id(self.request.user)
        selected_branch=proposed.get('branch')
        if assigned is False:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('An active branch assignment or organization administrator account is required.')
        if assigned is not None:
            if selected_branch is not None and selected_branch.pk!=assigned:
                from rest_framework.exceptions import PermissionDenied
                raise PermissionDenied('Expenses may only be posted to the assigned branch.')
            proposed['branch']=Branch.objects.get(pk=assigned)
        amount=Decimal(str(proposed.get('amount') or '0'))
        available=_ledger_balance('Cash', branch=proposed.get('branch').pk if proposed.get('branch') else None, branch_scoped=True)
        if amount <= 0 or amount > available:
            from rest_framework.exceptions import ValidationError
            raise ValidationError({'amount':f'Expense must be positive and not exceed available Cash balance ({available:.2f}).'})
        expense=serializer.save()
        ref=f'EXP-{expense.pk}'
        _post_pair(date=expense.date,debit_account=f'Expense: {expense.category}',credit_account='Cash',amount=expense.amount,reference=ref,note=expense.note or 'Expense recorded',branch=expense.branch)
class JournalEntryViewSet(SecureModelViewSet):
    queryset=JournalEntry.objects.all().order_by('-date','-id')
    serializer_class=JournalEntrySerializer
    def get_queryset(self):
        return _journal_queryset_for_request(self.request).order_by('-date','-id')
    # Posted journal rows are immutable through ordinary CRUD. Corrections should be
    # entered as explicit reversing entries, preserving the audit trail.
    http_method_names=['get','head','options']

    @action(detail=False, methods=['get'], url_path='trial-balance')
    def trial_balance(self,request):
        """Return account-wise debit/credit/net totals and grand-total balance check."""
        qs=self.filter_queryset(self.get_queryset())
        start=request.query_params.get('start_date'); end=request.query_params.get('end_date')
        from datetime import date as date_type
        try:
            start_value=date_type.fromisoformat(start) if start else None
            end_value=date_type.fromisoformat(end) if end else None
        except ValueError:
            return Response({'detail':'Dates must use YYYY-MM-DD format.'},status=400)
        if start_value and end_value and start_value>end_value:
            return Response({'detail':'start_date cannot be after end_date.'},status=400)
        if start_value: qs=qs.filter(date__gte=start_value)
        if end_value: qs=qs.filter(date__lte=end_value)
        rows=qs.values('account').annotate(debit_total=Sum('debit'),credit_total=Sum('credit')).order_by('account')
        data=[]; grand_debit=Decimal('0'); grand_credit=Decimal('0')
        for row in rows:
            debit=row['debit_total'] or Decimal('0'); credit=row['credit_total'] or Decimal('0')
            grand_debit+=debit; grand_credit+=credit
            data.append({'account':row['account'],'debit':str(debit),'credit':str(credit),'net_debit':str(max(Decimal('0'),debit-credit)),'net_credit':str(max(Decimal('0'),credit-debit))})
        return Response({'start_date':start or None,'end_date':end or None,'accounts':data,'total_debit':str(grand_debit),'total_credit':str(grand_credit),'difference':str(grand_debit-grand_credit),'balanced':grand_debit==grand_credit})

    @action(detail=False, methods=['post'], url_path='post-batch')
    @transaction.atomic
    def post_batch(self, request):
        """Post a balanced, multi-line journal in one database transaction.

        Payload: {date, entry_type, reference, note, lines:[{account,debit,credit,note}]}
        At least two lines are required and total debits must equal total credits.
        """
        lines=request.data.get('lines')
        if not isinstance(lines,list) or len(lines)<2:
            return Response({'detail':'At least two journal lines are required.'},status=400)
        date_value=request.data.get('date') or timezone.localdate()
        try:
            from datetime import date as _date_type
            date_value=_date_type.fromisoformat(str(date_value)) if not hasattr(date_value,'year') else date_value
            _assert_financial_period_open(date_value)
        except Exception as exc:
            detail=getattr(exc,'detail',str(exc))
            return Response({'detail':detail},status=409)
        entry_type=request.data.get('entry_type','adjustment')
        reference=str(request.data.get('reference','')).strip()[:120]
        common_note=str(request.data.get('note',''))
        if entry_type not in dict(JournalEntry.ENTRY):
            return Response({'detail':'Invalid journal entry type.'},status=400)
        debit_total=Decimal('0'); credit_total=Decimal('0'); cleaned=[]
        for index,line in enumerate(lines):
            try:
                account=str(line.get('account','')).strip()
                debit=Decimal(str(line.get('debit',0) or 0))
                credit=Decimal(str(line.get('credit',0) or 0))
            except Exception:
                return Response({'detail':f'Invalid amount on line {index+1}.'},status=400)
            if not account or debit<0 or credit<0 or (debit>0 and credit>0) or (debit==0 and credit==0):
                return Response({'detail':f'Line {index+1} must have an account and exactly one positive debit or credit.'},status=400)
            mapped_matches=list(ChartOfAccount.objects.filter(name__iexact=account,active=True)[:2])
            if len(mapped_matches)!=1:
                reason='not mapped to an active Chart of Accounts entry' if not mapped_matches else 'matches multiple active Chart of Accounts entries'
                return Response({'detail':f'Line {index+1} account "{account}" {reason}. Resolve the mapping first; no journal rows were posted.'},status=400)
            mapped=mapped_matches[0]
            debit_total+=debit; credit_total+=credit
            cleaned.append({'account':mapped.name,'account_ref':mapped,'debit':debit,'credit':credit,'note':str(line.get('note',common_note))})
        if debit_total != credit_total:
            return Response({'detail':'Journal is not balanced. Total debit and credit must match.','debit_total':str(debit_total),'credit_total':str(credit_total)},status=400)
        if not reference:
            return Response({'reference':'A unique voucher reference is required for a journal batch.'},status=400)
        if JournalEntry.objects.filter(reference__iexact=reference).exists():
            return Response({'detail':'This voucher reference is already present in the ledger. Use a unique reference; no rows were posted.'},status=409)
        created=[]
        for line in cleaned:
            created.append(JournalEntry.objects.create(date=date_value,entry_type=entry_type,reference=reference,
                account=line['account'],account_ref=line['account_ref'],debit=line['debit'],credit=line['credit'],note=line['note']))
        AuditLog.objects.create(user=request.user,action='post_balanced_journal',model_name='JournalEntry',
            object_id=reference,details={'line_count':len(created),'debit_total':str(debit_total),'credit_total':str(credit_total)})
        return Response({'posted':True,'line_count':len(created),'debit_total':str(debit_total),
            'credit_total':str(credit_total),'entries':JournalEntrySerializer(created,many=True).data},status=201)

class FinancialPeriodLockRequestViewSet(SecureModelViewSet):
    queryset=FinancialPeriodLockRequest.objects.select_related('created_by','decided_by').all()
    serializer_class=FinancialPeriodLockRequestSerializer
    http_method_names=['get','post','head','options']
    def get_queryset(self):
        # These are organization-wide accounting controls, not branch-owned customer records.
        # Feature permissions, not branch filtering, gate access to the lock register.
        return FinancialPeriodLockRequest.objects.select_related('created_by','decided_by').all()
    def create(self,request,*args,**kwargs):
        denied=_deny_unless_feature(request,'manage_financial_locks')
        if denied:return denied
        from datetime import date as date_type
        try:
            start=date_type.fromisoformat(str(request.data.get('start_date',''))); end=date_type.fromisoformat(str(request.data.get('end_date','')))
        except ValueError:return Response({'detail':'Dates must use YYYY-MM-DD format.'},status=400)
        reason=str(request.data.get('reason') or '').strip()
        if start>end:return Response({'end_date':'End date must be on or after start date.'},status=400)
        if len(reason)<5:return Response({'reason':'Provide a reason of at least 5 characters.'},status=400)
        overlap=FinancialPeriodLockRequest.objects.filter(status__in=['pending','approved'],start_date__lte=end,end_date__gte=start).exists()
        if overlap:return Response({'detail':'An overlapping pending or approved financial lock already exists.'},status=409)
        item=FinancialPeriodLockRequest.objects.create(start_date=start,end_date=end,reason=reason,created_by=request.user)
        AuditLog.objects.create(user=request.user,action='financial_period_lock_requested',model_name='FinancialPeriodLockRequest',object_id=str(item.pk),details={'start_date':str(start),'end_date':str(end),'reason':reason})
        return Response(self.get_serializer(item).data,status=201)
    @action(detail=True,methods=['post'])
    def approve(self,request,pk=None):
        denied=_deny_unless_feature(request,'approve_financial_locks')
        if denied:return denied
        with transaction.atomic():
            target_id=self.get_object().pk
            # Lock requests in a stable order before locking the target row to avoid approval deadlocks.
            list(FinancialPeriodLockRequest.objects.select_for_update().filter(status__in=['pending','approved']).order_by('id').values_list('id',flat=True))
            item=FinancialPeriodLockRequest.objects.select_for_update().get(pk=target_id)
            if item.status!='pending':return Response({'detail':'Only pending lock requests can be approved.'},status=409)
            if item.created_by_id==request.user.pk:return Response({'detail':'Maker-checker: the requester cannot approve their own financial-period lock.'},status=403)
            note=str(request.data.get('decision_note') or '').strip()
            if len(note)<5:return Response({'decision_note':'Approval note must contain at least 5 characters.'},status=400)
            if FinancialPeriodLockRequest.objects.filter(status='approved',start_date__lte=item.end_date,end_date__gte=item.start_date).exclude(pk=item.pk).exists():return Response({'detail':'An approved lock overlaps this date range.'},status=409)
            item.status='approved';item.decided_by=request.user;item.decision_note=note;item.decided_at=timezone.now();item.save(update_fields=['status','decided_by','decision_note','decided_at','updated_at'])
            AuditLog.objects.create(user=request.user,action='financial_period_locked',model_name='FinancialPeriodLockRequest',object_id=str(item.pk),details={'start_date':str(item.start_date),'end_date':str(item.end_date),'note':note})
        return Response(self.get_serializer(item).data)
    @action(detail=True,methods=['post'])
    def reject(self,request,pk=None):
        denied=_deny_unless_feature(request,'approve_financial_locks')
        if denied:return denied
        with transaction.atomic():
            item=FinancialPeriodLockRequest.objects.select_for_update().get(pk=self.get_object().pk)
            if item.status!='pending':return Response({'detail':'Only pending lock requests can be rejected.'},status=409)
            if item.created_by_id==request.user.pk:return Response({'detail':'Maker-checker: the requester cannot reject their own request.'},status=403)
            note=str(request.data.get('decision_note') or '').strip()
            if len(note)<5:return Response({'decision_note':'Rejection note must contain at least 5 characters.'},status=400)
            item.status='rejected';item.decided_by=request.user;item.decision_note=note;item.decided_at=timezone.now();item.save(update_fields=['status','decided_by','decision_note','decided_at','updated_at'])
            AuditLog.objects.create(user=request.user,action='financial_period_lock_rejected',model_name='FinancialPeriodLockRequest',object_id=str(item.pk),details={'note':note})
        return Response(self.get_serializer(item).data)


class PaymentReversalRequestViewSet(viewsets.ReadOnlyModelViewSet):
    queryset=PaymentReversalRequest.objects.select_related('payment','created_by','decided_by').all()
    serializer_class=PaymentReversalRequestSerializer
    permission_classes=[IsAuthenticated,StaffFeaturePermission]
    def get_queryset(self):
        qs=PaymentReversalRequest.objects.select_related('payment','payment__member','created_by','decided_by').all()
        branch=_staff_branch_id(self.request.user)
        if branch is False:return qs.none()
        if branch is not None:return qs.filter(payment__member__branch_id=branch)
        return qs
    @action(detail=False,methods=['post'],url_path='request')
    def request_reversal(self,request):
        denied=_deny_unless_feature(request,'manage_payment_reversals')
        if denied:return denied
        try: payment_id=int(request.data.get('payment'))
        except (TypeError,ValueError):return Response({'payment':'Select a valid payment.'},status=400)
        if not self.get_queryset().filter(payment_id=payment_id).exists():return Response({'detail':'Payment not found in your branch scope.'},status=404)
        reason=str(request.data.get('reason') or '').strip();key=str(request.data.get('idempotency_key') or '').strip() or None
        if len(reason)<5:return Response({'reason':'Provide a reason of at least 5 characters.'},status=400)
        with transaction.atomic():
            try: payment=Payment.objects.select_for_update().get(pk=payment_id)
            except Payment.DoesNotExist:return Response({'payment':'Select a valid payment.'},status=400)
            if key:
                retry=PaymentReversalRequest.objects.filter(idempotency_key=key).first()
                if retry:
                    if retry.payment_id==payment.pk and retry.created_by_id==request.user.pk and retry.reason==reason:return Response(self.get_serializer(retry).data,status=200)
                    return Response({'detail':'Idempotency key already belongs to another request.'},status=409)
            if payment.status!='success' or payment.is_reversed:return Response({'detail':'Only successful, unreversed payments can be submitted.'},status=409)
            if PaymentReversalRequest.objects.filter(payment=payment,status='pending').exists():return Response({'detail':'A reversal request is already pending.'},status=409)
            item=PaymentReversalRequest.objects.create(payment=payment,reason=reason,idempotency_key=key,created_by=request.user)
            AuditLog.objects.create(user=request.user,action='payment_reversal_requested',model_name='PaymentReversalRequest',object_id=str(item.pk),details={'payment_id':payment.pk,'receipt_no':payment.receipt_no,'reason':reason})
        return Response(self.get_serializer(item).data,status=202)
    @action(detail=True,methods=['post'])
    def approve(self,request,pk=None):
        denied=_deny_unless_feature(request,'approve_payment_reversals')
        if denied:return denied
        with transaction.atomic():
            item=PaymentReversalRequest.objects.select_for_update().get(pk=self.get_object().pk)
            if item.status!='pending':return Response({'detail':'Only pending reversal requests can be approved.'},status=409)
            if item.created_by_id==request.user.pk:return Response({'detail':'Maker-checker: the requester cannot approve their own reversal.'},status=403)
            note=str(request.data.get('decision_note') or '').strip()
            if len(note)<5:return Response({'decision_note':'Approval note must contain at least 5 characters.'},status=400)
            result,code=_execute_payment_reversal(item.payment_id,request.user,item.reason)
            if code!=200:return Response(result,status=code)
            item.status='approved';item.decided_by=request.user;item.decision_note=note;item.decided_at=timezone.now();item.reversal_reference=result.get('reversal_reference','');item.save(update_fields=['status','decided_by','decision_note','decided_at','reversal_reference','updated_at'])
            AuditLog.objects.create(user=request.user,action='payment_reversal_approved',model_name='PaymentReversalRequest',object_id=str(item.pk),details={'payment_id':item.payment_id,'reversal_reference':item.reversal_reference,'note':note})
        return Response({'request':self.get_serializer(item).data,'result':result})
    @action(detail=True,methods=['post'])
    def reject(self,request,pk=None):
        denied=_deny_unless_feature(request,'approve_payment_reversals')
        if denied:return denied
        with transaction.atomic():
            item=PaymentReversalRequest.objects.select_for_update().get(pk=self.get_object().pk)
            if item.status!='pending':return Response({'detail':'Only pending reversal requests can be rejected.'},status=409)
            if item.created_by_id==request.user.pk:return Response({'detail':'Maker-checker: the requester cannot reject their own reversal.'},status=403)
            note=str(request.data.get('decision_note') or '').strip()
            if len(note)<5:return Response({'decision_note':'Rejection note must contain at least 5 characters.'},status=400)
            item.status='rejected';item.decided_by=request.user;item.decision_note=note;item.decided_at=timezone.now();item.save(update_fields=['status','decided_by','decision_note','decided_at','updated_at'])
            AuditLog.objects.create(user=request.user,action='payment_reversal_rejected',model_name='PaymentReversalRequest',object_id=str(item.pk),details={'payment_id':item.payment_id,'note':note})
        return Response(self.get_serializer(item).data)


class AuditLogViewSet(viewsets.ReadOnlyModelViewSet): permission_classes=[IsAdminUser]; queryset=AuditLog.objects.select_related('user').all().order_by('-created_at'); serializer_class=AuditLogSerializer

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def member_ledger(request, member_id):
    for feature in ('view_customers','view_loans'):
        denied=_deny_unless_feature(request,feature)
        if denied: return denied
    branch=_staff_branch_id(request.user)
    try:
        member_qs=Member.objects.all() if branch is None else Member.objects.filter(branch_id=branch)
        if branch is False: member_qs=Member.objects.none()
        member=member_qs.get(pk=member_id)
    except Member.DoesNotExist:
        raise Http404('Customer not found.')
    loans=Loan.objects.filter(member=member).order_by('id')
    payments=Payment.objects.filter(member=member,status='success').order_by('paid_on','id')
    return Response({
        'member': {'id':member.pk,'member_no':member.member_no,'name':member.name,'phone':member.phone},
        'loans': LoanSerializer(loans,many=True).data,
        'payments': PaymentSerializer(payments,many=True).data,
        'total_paid': payments.aggregate(v=Sum('amount'))['v'] or Decimal('0'),
        'outstanding': sum((max(Decimal('0'),i.principal_due-i.principal_paid)+max(Decimal('0'),i.interest_due-i.interest_paid)+max(Decimal('0'),i.penalty_due-i.penalty_paid) for i in Installment.objects.filter(loan__member=member)),Decimal('0')),
    })

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def receipt_detail(request, receipt_no):
    if not any(_user_has_feature(request.user,f) for f in ('view_loans','collect_payments','view_accounting')):
        return Response({'detail':'This staff account does not have permission to view payment receipts.'},status=403)
    branch=_staff_branch_id(request.user)
    try:
        payment_qs=Payment.objects.select_related('member','loan','loan__product')
        if branch is not None:
            payment_qs=payment_qs.filter(member__branch_id=branch) if branch is not False else payment_qs.none()
        payment=payment_qs.get(receipt_no=receipt_no)
    except Payment.DoesNotExist:
        raise Http404('Receipt not found.')
    AuditLog.objects.create(user=request.user,action='view_receipt',model_name='Payment',object_id=str(payment.pk),details={'receipt_no':payment.receipt_no})
    return Response({
        'receipt_no':payment.receipt_no,'paid_on':payment.paid_on,'amount':payment.amount,'method':payment.method,
        'reference':payment.reference,'status':payment.status,
        'member':{'member_no':payment.member.member_no,'name':payment.member.name,'phone':payment.member.phone},
        'loan':({'id':payment.loan_id,'product':payment.loan.product.name,'principal':payment.loan.principal} if payment.loan_id else None),
    })

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def dashboard(request):
    denied=_deny_unless_feature(request,'view_dashboard')
    if denied: return denied
    today=timezone.localdate(); branch=_staff_branch_id(request.user)
    requested_branch=request.query_params.get('branch')
    if branch is None and requested_branch:
        try: selected_branch_id=int(requested_branch)
        except (TypeError,ValueError): return Response({'branch':'Select a valid branch id.'},status=400)
        if not Branch.objects.filter(pk=selected_branch_id,active=True).exists(): return Response({'branch':'Selected active branch was not found.'},status=404)
        branch=selected_branch_id
    member_qs=Member.objects.all(); loan_qs=Loan.objects.all(); app_qs=LoanApplication.objects.all(); payment_qs=Payment.objects.all(); installment_qs=Installment.objects.all(); expense_qs=Expense.objects.all(); kyc_qs=KycDocument.objects.all()
    if branch is False: return Response({'detail':'An active staff branch or administrator account is required.'},status=403)
    if branch is not None:
        member_qs=member_qs.filter(branch_id=branch); loan_qs=loan_qs.filter(member__branch_id=branch); app_qs=app_qs.filter(member__branch_id=branch)
        payment_qs=payment_qs.filter(member__branch_id=branch); installment_qs=installment_qs.filter(loan__member__branch_id=branch)
        expense_qs=expense_qs.filter(branch_id=branch); kyc_qs=kyc_qs.filter(member__branch_id=branch)
        cap_in=CapitalEntry.objects.filter(branch_id=branch,kind='in').aggregate(v=Sum('amount'))['v'] or Decimal('0')
        cap_out=CapitalEntry.objects.filter(branch_id=branch,kind='out').aggregate(v=Sum('amount'))['v'] or Decimal('0')
        _branch_ledger=JournalEntry.objects.filter(branch_id=branch)
        _cash_rows=_branch_ledger.filter(account__iexact='Cash')
        _bank_rows=_branch_ledger.filter(Q(account__iexact='Bank') | Q(account__istartswith='Bank:'))
        _cash_totals=_cash_rows.aggregate(d=Sum('debit'),c=Sum('credit'))
        _bank_totals=_bank_rows.aggregate(d=Sum('debit'),c=Sum('credit'))
        cash_balance=((_cash_totals['d'] or Decimal('0'))-(_cash_totals['c'] or Decimal('0'))) if _cash_rows.exists() else None
        bank_balance=((_bank_totals['d'] or Decimal('0'))-(_bank_totals['c'] or Decimal('0'))) if _bank_rows.exists() else None
    else:
        cap_in=CapitalEntry.objects.filter(kind='in').aggregate(v=Sum('amount'))['v'] or Decimal('0'); cap_out=CapitalEntry.objects.filter(kind='out').aggregate(v=Sum('amount'))['v'] or Decimal('0')
        cash=JournalEntry.objects.filter(account__iexact='cash').aggregate(d=Sum('debit'),c=Sum('credit'))
        bank=JournalEntry.objects.filter(Q(account__iexact='bank') | Q(account__istartswith='Bank:')).aggregate(d=Sum('debit'),c=Sum('credit'))
        cash_balance=(cash['d'] or Decimal('0'))-(cash['c'] or Decimal('0')); bank_balance=(bank['d'] or Decimal('0'))-(bank['c'] or Decimal('0'))
    collection=payment_qs.filter(status='success').aggregate(v=Sum('amount'))['v'] or Decimal('0'); disb=loan_qs.filter(status='disbursed').aggregate(v=Sum('principal'))['v'] or Decimal('0')
    installment_sums=installment_qs.aggregate(pd=Sum('principal_due')-Sum('principal_paid'),it=Sum('interest_due')-Sum('interest_paid'),pe=Sum('penalty_due')-Sum('penalty_paid')); out=sum((v or Decimal('0')) for v in installment_sums.values())
    overdue_qs=installment_qs.filter(due_date__lt=today).exclude(status='paid')
    overdue=overdue_qs.count(); pending=app_qs.filter(status='pending').count(); expenses=expense_qs.aggregate(v=Sum('amount'))['v'] or Decimal('0')
    # Explicit dashboard fields used by the reference-style summary panels.
    # Keep all queries on the already branch-scoped querysets above.
    due_today_qs=installment_qs.filter(due_date=today).exclude(status='paid')
    pending_emi_today=due_today_qs.count()
    pending_emi_amount_today=max(Decimal('0'), due_today_qs.aggregate(v=Sum(
        F('principal_due')-F('principal_paid') + F('interest_due')-F('interest_paid') + F('penalty_due')-F('penalty_paid')
    ))['v'] or Decimal('0'))
    complete_loans=loan_qs.filter(status='closed').count()
    settled_loans=SettlementCase.objects.filter(member__branch_id=branch if branch is not None else F('member__branch_id'), status='paid').values('loan_id').distinct().count() if branch is not None else SettlementCase.objects.filter(status='paid').values('loan_id').distinct().count()
    recent_members=list(member_qs.order_by('-created_at','-id').values(
        'id','member_no','name','phone','address','created_at'
    )[:5])
    recent_members=[{'id':m['id'],'customer_code':m['member_no'],'name':m['name'],'phone':m['phone'],'address':m['address'],'created_at':m['created_at']} for m in recent_members]
    # Organization administrators receive an all-branch operational summary.
    # Branch cash/bank figures include only entries explicitly tagged to that branch;
    # historical untagged ledger rows remain unallocated until an admin reconciles them.
    branch_summaries=[]
    if branch is None:
        for _branch in Branch.objects.filter(active=True).order_by('name','id'):
            _members=Member.objects.filter(branch_id=_branch.id)
            _loans=Loan.objects.filter(member__branch_id=_branch.id)
            _installments=Installment.objects.filter(loan__member__branch_id=_branch.id)
            _payments=Payment.objects.filter(member__branch_id=_branch.id, status='success', is_reversed=False)
            _expenses=Expense.objects.filter(branch_id=_branch.id)
            _out=_installments.aggregate(
                principal=Sum('principal_due')-Sum('principal_paid'),
                interest=Sum('interest_due')-Sum('interest_paid'),
                penalty=Sum('penalty_due')-Sum('penalty_paid'))
            _overdue_qs=_installments.filter(due_date__lt=today).exclude(status='paid')
            _overdue_amount=_overdue_qs.aggregate(v=Sum(
                F('principal_due')-F('principal_paid') + F('interest_due')-F('interest_paid') + F('penalty_due')-F('penalty_paid'))
            )['v'] or Decimal('0')
            _ledger_rows=JournalEntry.objects.filter(branch_id=_branch.id)
            _cash_qs=_ledger_rows.filter(account__iexact='Cash')
            _bank_qs=_ledger_rows.filter(Q(account__iexact='Bank') | Q(account__istartswith='Bank:'))
            _cash=_cash_qs.aggregate(d=Sum('debit'),c=Sum('credit'))
            _bank=_bank_qs.aggregate(d=Sum('debit'),c=Sum('credit'))
            branch_summaries.append({
                'branch_id':_branch.id,'branch_name':_branch.name,'branch_code':_branch.code,
                'members':_members.filter(active=True).count(),
                'active_loans':_loans.filter(status='disbursed').count(),
                'loan_disbursed':_loans.filter(status='disbursed').aggregate(v=Sum('principal'))['v'] or Decimal('0'),
                'collection_total':_payments.aggregate(v=Sum('amount'))['v'] or Decimal('0'),
                'collection_today':_payments.filter(paid_on=today).aggregate(v=Sum('amount'))['v'] or Decimal('0'),
                'outstanding':max(Decimal('0'),sum((v or Decimal('0')) for v in _out.values())),
                'overdue_count':_overdue_qs.count(),
                'overdue_amount':max(Decimal('0'),_overdue_amount),
                'expenses':_expenses.aggregate(v=Sum('amount'))['v'] or Decimal('0'),
                'expenses_today':_expenses.filter(date=today).aggregate(v=Sum('amount'))['v'] or Decimal('0'),
                # Null means this branch has no attributable ledger entries; legacy rows are never guessed into a branch.
                'cash_balance':((_cash['d'] or Decimal('0'))-(_cash['c'] or Decimal('0')) if _cash_qs.exists() else None),
                'bank_balance':((_bank['d'] or Decimal('0'))-(_bank['c'] or Decimal('0')) if _bank_qs.exists() else None),
                'ledger_attribution_status':'tagged' if _ledger_rows.exists() else 'no_branch_tagged_ledger_entries',
            })
    settlement_qs=SettlementCase.objects.all()
    if branch is not None:
        settlement_qs=settlement_qs.filter(member__branch_id=branch)
    settlement_due_amount=settlement_qs.exclude(status__in=['paid','cancelled','rejected']).aggregate(v=Sum('proposed_amount'))['v'] or Decimal('0')
    settlement_paid_amount=settlement_qs.filter(status='paid').aggregate(v=Sum('proposed_amount'))['v'] or Decimal('0')
    # Organization-wide cash/bank totals include all posted rows. Branch-scoped totals above use only branch-tagged rows.
    # Portfolio figures are derived from dated operational records; avoid presenting capital as a bank balance.
    installment_totals=installment_qs.aggregate(
        principal_due=Sum('principal_due'), principal_paid=Sum('principal_paid'),
        interest_due=Sum('interest_due'), interest_paid=Sum('interest_paid'),
        penalty_due=Sum('penalty_due'), penalty_paid=Sum('penalty_paid'))
    principal_outstanding=max(Decimal('0'),(installment_totals['principal_due'] or Decimal('0'))-(installment_totals['principal_paid'] or Decimal('0')))
    interest_outstanding=max(Decimal('0'),(installment_totals['interest_due'] or Decimal('0'))-(installment_totals['interest_paid'] or Decimal('0')))
    penalty_outstanding=max(Decimal('0'),(installment_totals['penalty_due'] or Decimal('0'))-(installment_totals['penalty_paid'] or Decimal('0')))
    principal_collected=installment_totals['principal_paid'] or Decimal('0')
    interest_collected=installment_totals['interest_paid'] or Decimal('0')
    penalty_collected=installment_totals['penalty_paid'] or Decimal('0')
    # Today / Weekly / Monthly / Total breakdowns used by the reference-style dashboard tables.
    week_start=today-timedelta(days=today.weekday()); month_start=today.replace(day=1)
    def _window(field,key):
        return {'today':{field:today},'weekly':{field+'__gte':week_start,field+'__lte':today},'monthly':{field+'__gte':month_start,field+'__lte':today},'total':{}}[key]
    _pending_expr=Sum(F('principal_due')-F('principal_paid')+F('interest_due')-F('interest_paid')+F('penalty_due')-F('penalty_paid'))
    periods={'collection_approved':{},'collection_pending':{},'disbursement_approved':{},'disbursement_pending':{}}
    for _k in ('today','weekly','monthly','total'):
        periods['collection_approved'][_k]=payment_qs.filter(status='success',**_window('paid_on',_k)).aggregate(v=Sum('amount'))['v'] or Decimal('0')
        _due_filter={'due_date__lte':today} if _k=='total' else _window('due_date',_k)
        periods['collection_pending'][_k]=max(Decimal('0'),installment_qs.exclude(status='paid').filter(**_due_filter).aggregate(v=_pending_expr)['v'] or Decimal('0'))
        periods['disbursement_approved'][_k]=loan_qs.filter(status='disbursed',**_window('disbursed_on',_k)).aggregate(v=Sum('principal'))['v'] or Decimal('0')
        periods['disbursement_pending'][_k]=loan_qs.filter(status='approved',**_window('updated_at__date',_k)).count()
    return Response({
        'members':member_qs.filter(active=True).count(),
        'active_loans':loan_qs.filter(status='disbursed').count(),
        'complete_loans':complete_loans,
        'completed_loan_count':complete_loans,
        'settled_loans':settled_loans,
        'settled_loan_count':settled_loans,
        'pending_emi_today':pending_emi_today,
        'pending_emi_count':pending_emi_today,
        'pending_emi_amount_today':pending_emi_amount_today,
        'pending_emi_amount':pending_emi_amount_today,
        'overdue_emi_count':overdue,
        'recent_members':recent_members,
        'settlement_due_amount':settlement_due_amount,
        'settlement_paid_amount':settlement_paid_amount,
        'total_loans':loan_qs.count(),
        'disbursed':disb,
        'outstanding':max(Decimal('0'),out),
        'principal_outstanding':principal_outstanding,
        'interest_outstanding':interest_outstanding,
        'penalty_outstanding':penalty_outstanding,
        'collection':collection,
        'principal_collected':principal_collected,
        'interest_income':interest_collected,
        'penalty_collected':penalty_collected,
        'overdue':overdue,
        'overdue_amount':sum((max(Decimal('0'),i.principal_due-i.principal_paid)+max(Decimal('0'),i.interest_due-i.interest_paid)+max(Decimal('0'),i.penalty_due-i.penalty_paid) for i in overdue_qs),Decimal('0')),
        'pending_approvals':pending,
        'capital_in':cap_in,'capital_out':cap_out,'net_capital':(cap_in-cap_out if cap_in is not None and cap_out is not None else None),
        'expenses':expenses,
        'cash_balance':cash_balance,'bank_balance':bank_balance,
        'total_cash_bank_balance':(cash_balance+bank_balance if cash_balance is not None and bank_balance is not None else None),
        'today_collection':payment_qs.filter(paid_on=today,status='success').aggregate(v=Sum('amount'))['v'] or Decimal('0'),
        'today_disbursement':loan_qs.filter(disbursed_on=today,status='disbursed').aggregate(v=Sum('principal'))['v'] or Decimal('0'),
        'today_expenses':expense_qs.filter(date=today).aggregate(v=Sum('amount'))['v'] or Decimal('0'),
        'periods':periods,
        'scope_notice':('Branch balances are based only on journal rows explicitly tagged to this branch. Legacy untagged rows are not automatically assigned.' if branch is not None else 'Organization-wide totals include all posted ledger rows. Per-branch balances show only explicitly branch-tagged journal rows; untagged legacy rows require reconciliation.'),
        'branch_summaries':branch_summaries,
    })


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def trial_balance(request):
    denied=_deny_unless_feature(request,'view_accounting')
    if denied: return denied
    branch_denied=_deny_branch_global_accounting(request)
    if branch_denied: return branch_denied
    """Return account-wise debit, credit and net balance from posted journal lines.

    This is a ledger-derived report, not a substitute for accountant-reviewed
    chart-of-accounts classification or opening-balance migration.
    Optional query parameters: from_date=YYYY-MM-DD, to_date=YYYY-MM-DD.
    """
    qs=_journal_queryset_for_request(request)
    from_date=request.query_params.get('from_date')
    to_date=request.query_params.get('to_date')
    if from_date:
        qs=qs.filter(date__gte=from_date)
    if to_date:
        qs=qs.filter(date__lte=to_date)
    rows=qs.values('account').annotate(debit_total=Sum('debit'),credit_total=Sum('credit')).order_by('account')
    accounts=[]; debit_grand=Decimal('0'); credit_grand=Decimal('0')
    for row in rows:
        debit=row['debit_total'] or Decimal('0'); credit=row['credit_total'] or Decimal('0')
        debit_grand+=debit; credit_grand+=credit
        accounts.append({'account':row['account'],'debit':str(debit),'credit':str(credit),'net_debit':str(debit-credit)})
    return Response({'from_date':from_date,'to_date':to_date,'accounts':accounts,
        'total_debit':str(debit_grand),'total_credit':str(credit_grand),
        'difference':str(debit_grand-credit_grand),'balanced':debit_grand==credit_grand,
        'source':'posted journal entries'})

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def accounting_summary(request):
    denied=_deny_unless_feature(request,'view_accounting')
    if denied: return denied
    branch_denied=_deny_branch_global_accounting(request)
    if branch_denied: return branch_denied
    """Return ledger totals and clearly-labelled operational figures."""
    rows=_journal_queryset_for_request(request).values('account').annotate(debit_total=Sum('debit'),credit_total=Sum('credit')).order_by('account')
    ledger=[]
    for row in rows:
        debit=row['debit_total'] or Decimal('0'); credit=row['credit_total'] or Decimal('0')
        ledger.append({'account':row['account'],'debit':str(debit),'credit':str(credit),'net_debit':str(debit-credit)})
    total_debit=sum((Decimal(x['debit']) for x in ledger),Decimal('0'))
    total_credit=sum((Decimal(x['credit']) for x in ledger),Decimal('0'))
    return Response({'ledger_accounts':ledger,'total_debit':str(total_debit),'total_credit':str(total_credit),
        'difference':str(total_debit-total_credit),'balanced':total_debit==total_credit,
        'note':'Figures reflect journal rows currently recorded. Chart-of-accounts mapping, opening balances and bank reconciliation require setup before statutory financial statements can be relied upon.'})

@api_view(['GET'])
@permission_classes([IsAuthenticated,IsAdminUser])
def bank_reconciliation_summary(request):
    qs=BankReconciliationLine.objects.all()
    account=request.query_params.get('bank_account')
    if account: qs=qs.filter(bank_account__iexact=account)
    from_date=request.query_params.get('from_date'); to_date=request.query_params.get('to_date')
    if from_date: qs=qs.filter(statement_date__gte=from_date)
    if to_date: qs=qs.filter(statement_date__lte=to_date)
    rows=qs.values('status').annotate(count=Sum('id'))
    counts={r['status']:r['count'] or 0 for r in rows}
    return Response({'bank_account':account,'from_date':from_date,'to_date':to_date,'total_lines':qs.count(),'matched':counts.get('matched',0),'unmatched':counts.get('unmatched',0),'ignored':counts.get('ignored',0),'statement_debits':str(qs.aggregate(v=Sum('debit'))['v'] or Decimal('0')),'statement_credits':str(qs.aggregate(v=Sum('credit'))['v'] or Decimal('0')),'warning':'Matching a line records a user-confirmed reference link; it does not prove amount/date equality or replace accountant review.'})


@api_view(["GET"])
@permission_classes([IsAuthenticated,IsAdminUser])
def loan_subledger_reconciliation(request):
    """Compare operational loan records with journal postings and installment allocations."""
    from django.db.models import Sum
    disbursed_loans=Loan.objects.filter(status='disbursed')
    loans_principal=disbursed_loans.aggregate(v=Sum('principal'))['v'] or Decimal('0')
    disbursement_records=Disbursement.objects.filter(status='success').aggregate(v=Sum('amount'))['v'] or Decimal('0')
    journal_disbursements=JournalEntry.objects.filter(account__iexact='Loans Receivable',debit__gt=0,reference__startswith='DISB-LOAN-').aggregate(v=Sum('debit'))['v'] or Decimal('0')
    inst=Installment.objects.aggregate(pd=Sum('principal_due'),pp=Sum('principal_paid'),id=Sum('interest_due'),ip=Sum('interest_paid'),pen=Sum('penalty_due'),penp=Sum('penalty_paid'))
    principal_due=inst['pd'] or Decimal('0'); principal_paid=inst['pp'] or Decimal('0')
    payment_total=Payment.objects.filter(status='success').aggregate(v=Sum('amount'))['v'] or Decimal('0')
    allocation_total=principal_paid+(inst['ip'] or Decimal('0'))+(inst['penp'] or Decimal('0'))
    data={
        'disbursed_loan_principal':str(loans_principal),
        'successful_disbursement_records':str(disbursement_records),
        'journal_loans_receivable_debits':str(journal_disbursements),
        'disbursement_vs_loan_difference':str(loans_principal-disbursement_records),
        'loan_principal_due_in_schedule':str(principal_due),
        'principal_allocated_paid':str(principal_paid),
        'principal_outstanding_from_schedule':str(max(Decimal('0'),principal_due-principal_paid)),
        'interest_due_in_schedule':str(inst['id'] or Decimal('0')),
        'interest_allocated_paid':str(inst['ip'] or Decimal('0')),
        'successful_payment_receipts_total':str(payment_total),
        'installment_allocations_total':str(allocation_total),
        'payment_vs_installment_allocation_difference':str(payment_total-allocation_total),
        'checks':{
          'disbursement_records_match_loans':loans_principal==disbursement_records,
          'journal_disbursements_match_loans':loans_principal==journal_disbursements,
          'payments_match_installment_allocations':payment_total==allocation_total,
        },
        'warning':'Differences are diagnostic, not automatic corrections. Legacy or unallocated payments, non-standard account names, reversals and opening balances may affect comparisons; investigate before posting adjustments.'
    }
    return Response(data)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def reports(request):
    denied=_deny_unless_feature(request,'view_reports')
    if denied: return denied
    today=timezone.localdate(); branch=_staff_branch_id(request.user)
    if branch is False: return Response({'detail':'An active staff branch or administrator account is required.'},status=403)
    requested_branch=request.query_params.get('branch')
    if branch is None and requested_branch:
        try: branch=int(requested_branch)
        except (TypeError,ValueError): return Response({'branch':'Select a valid branch id.'},status=400)
        if not Branch.objects.filter(pk=branch,active=True).exists(): return Response({'branch':'Selected active branch was not found.'},status=404)
    member_qs=Member.objects.all(); loan_qs=Loan.objects.all(); app_qs=LoanApplication.objects.all(); payment_qs=Payment.objects.all(); installment_qs=Installment.objects.all(); expense_qs=Expense.objects.all(); kyc_qs=KycDocument.objects.all()
    if branch is not None:
        member_qs=member_qs.filter(branch_id=branch); loan_qs=loan_qs.filter(member__branch_id=branch); app_qs=app_qs.filter(member__branch_id=branch)
        payment_qs=payment_qs.filter(member__branch_id=branch); installment_qs=installment_qs.filter(loan__member__branch_id=branch)
        expense_qs=expense_qs.filter(branch_id=branch); kyc_qs=kyc_qs.filter(member__branch_id=branch)
        cap_in=CapitalEntry.objects.filter(branch_id=branch,kind='in').aggregate(v=Sum('amount'))['v'] or Decimal('0')
        cap_out=CapitalEntry.objects.filter(branch_id=branch,kind='out').aggregate(v=Sum('amount'))['v'] or Decimal('0')
    else:
        cap_in=CapitalEntry.objects.filter(kind="in").aggregate(v=Sum("amount"))["v"] or Decimal("0")
        cap_out=CapitalEntry.objects.filter(kind="out").aggregate(v=Sum("amount"))["v"] or Decimal("0")
    collection=payment_qs.filter(status="success").aggregate(v=Sum("amount"))["v"] or Decimal("0")
    disbursed=loan_qs.filter(status="disbursed").aggregate(v=Sum("principal"))["v"] or Decimal("0")
    expenses=expense_qs.aggregate(v=Sum("amount"))["v"] or Decimal("0")
    inst=installment_qs.aggregate(pd=Sum("principal_due"),pp=Sum("principal_paid"),it=Sum("interest_due"),ip=Sum("interest_paid"),pen=Sum("penalty_due"),penp=Sum("penalty_paid"))
    outstanding=(inst["pd"] or Decimal("0"))-(inst["pp"] or Decimal("0"))+(inst["it"] or Decimal("0"))-(inst["ip"] or Decimal("0"))+(inst["pen"] or Decimal("0"))-(inst["penp"] or Decimal("0"))
    overdue=installment_qs.filter(due_date__lt=today).exclude(status="paid")
    overdue_amount=sum((max(Decimal("0"),i.principal_due-i.principal_paid)+max(Decimal("0"),i.interest_due-i.interest_paid)+max(Decimal("0"),i.penalty_due-i.penalty_paid) for i in overdue),Decimal("0"))
    return Response({
        "members":member_qs.filter(active=True).count(), "inactive_members":member_qs.filter(active=False).count(),
        "loans":loan_qs.count(), "active_loans":loan_qs.filter(status="disbursed").count(),
        "pending_applications":app_qs.filter(status="pending").count(),
        "approved_applications":app_qs.filter(status="approved").count(),
        "rejected_applications":app_qs.filter(status="rejected").count(),
        "disbursed":disbursed, "collection":collection,
        "today_collection":payment_qs.filter(status="success",paid_on=today).aggregate(v=Sum("amount"))["v"] or Decimal("0"),
        "outstanding":max(Decimal("0"),outstanding), "overdue_installments":overdue.count(), "overdue_amount":overdue_amount,
        "expenses":expenses, "capital_in":cap_in, "capital_out":cap_out, "net_capital":(cap_in-cap_out if cap_in is not None and cap_out is not None else None),
        "profit_loss_proxy":(collection-expenses if branch is None else None), "kyc_pending":kyc_qs.filter(verified=False).count(),
        "kyc_verified":kyc_qs.filter(verified=True).count(),
        "scope_notice":("Capital and profit/loss proxy are hidden in branch view because capital and journal rows are not consistently branch-tagged." if branch is not None else ""),
    })


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def export_csv(request):
    denied=_deny_unless_feature(request,'view_reports')
    if denied: return denied
    kind=request.query_params.get("type","")
    allowed={
        "members": ("members.csv", ["member_no","name","phone","email","occupation","household_income","kyc_type","active"], Member.objects.all().order_by("id")),
        "loans": ("loans.csv", ["id","member_id","product_id","principal","interest_total","total_payable","status","start_date","disbursed_on"], Loan.objects.all().order_by("id")),
        "payments": ("payments.csv", ["receipt_no","member_id","loan_id","amount","method","reference","paid_on","status"], Payment.objects.all().order_by("id")),
        "installments": ("installments.csv", ["loan_id","number","due_date","principal_due","interest_due","penalty_due","principal_paid","interest_paid","penalty_paid","status"], Installment.objects.all().order_by("loan_id","number")),
        "capital": ("capital.csv", ["date","kind","amount","reference","note"], CapitalEntry.objects.all().order_by("date","id")),
        "expenses": ("expenses.csv", ["date","category","amount","note","branch_id"], Expense.objects.all().order_by("date","id")),
        "journal": ("journal.csv", ["date","entry_type","account","debit","credit","reference","note"], JournalEntry.objects.all().order_by("date","id")),
    }
    if kind not in allowed:
        return Response({"detail":"Choose type: members, loans, payments, installments, capital, expenses or journal."},status=400)
    filename,fields,queryset=allowed[kind]
    branch=_staff_branch_id(request.user)
    if branch is False: return Response({'detail':'An active staff branch or administrator account is required.'},status=403)
    requested_branch=request.query_params.get('branch')
    if branch is None and requested_branch:
        try: branch=int(requested_branch)
        except (TypeError,ValueError): return Response({'branch':'Select a valid branch id.'},status=400)
        if not Branch.objects.filter(pk=branch,active=True).exists(): return Response({'branch':'Selected active branch was not found.'},status=404)
    if branch is not None:
        if kind=='members': queryset=queryset.filter(branch_id=branch)
        elif kind=='loans': queryset=queryset.filter(member__branch_id=branch)
        elif kind=='payments': queryset=queryset.filter(member__branch_id=branch)
        elif kind=='installments': queryset=queryset.filter(loan__member__branch_id=branch)
        elif kind=='expenses': queryset=queryset.filter(branch_id=branch)
        elif kind=='capital': queryset=queryset.filter(branch_id=branch)
        elif kind=='journal': queryset=queryset.filter(branch_id=branch)
    response=HttpResponse(content_type="text/csv; charset=utf-8")
    response["Content-Disposition"]=f'attachment; filename="{filename}"'
    response["Cache-Control"]="private, no-store"
    response.write("\ufeff")
    writer=csv.writer(response); writer.writerow(fields)
    def safe_csv(value):
        if value is None: return ''
        value=str(value)
        # Excel/LibreOffice formula injection guard for untrusted textual values.
        if isinstance(value, str) and value.lstrip('\t\r\n ').startswith(('=','+','-','@')):
            return "'"+value
        return value
    for obj in queryset.iterator(chunk_size=500):
        writer.writerow([safe_csv(getattr(obj,field,None)) for field in fields])
    AuditLog.objects.create(user=request.user,action="export_csv",model_name=kind,details={"type":kind})
    return response


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def health(request): return Response({'status':'ok','service':'NMFA API','time':timezone.now()})


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def current_user_permissions(request):
    """Return only the current user's UI permissions; never expose another user's profile."""
    user=request.user
    profile=getattr(user,'staff_profile',None)
    is_admin=bool(user.is_superuser or (user.is_staff and profile is None) or (profile and profile.active and profile.role=='admin'))
    if profile and (not profile.active or not user.is_active):
        return Response({'detail':'This staff account is inactive.'},status=403)
    custom_role=getattr(profile,'custom_role',None) if profile else None
    role_permissions=(custom_role.permissions or {}) if (custom_role and custom_role.active) else {}
    permissions={} if profile is None else {**role_permissions, **dict(profile.permissions or {})}
    if permissions.get('manage_settings') or permissions.get('manage_company_settings'):
        permissions['manage_settings']=True
        permissions['manage_company_settings']=True
    if is_admin:
        permissions={'*':True}
    return Response({'id':user.pk,'username':user.get_username(),'is_admin':is_admin,'role':profile.role if profile else ('admin' if is_admin else 'staff'),'branch':profile.branch_id if profile else None,'permissions':permissions})


@api_view(['GET','POST'])
@permission_classes([IsAuthenticated])
def integration_settings(request):
    if not request.user.is_staff:
        return Response({'detail':'Administrator access required.'},status=403)
    if request.method=='GET':
        return Response(IntegrationSettingSerializer(IntegrationSetting.objects.all(),many=True).data)
    provider=request.data.get('provider'); key=request.data.get('key'); value=request.data.get('value','')
    if provider not in dict(IntegrationSetting.PROVIDERS) or not key:
        return Response({'detail':'Valid provider and key are required.'},status=400)
    obj,_=IntegrationSetting.objects.get_or_create(provider=provider,key=key)
    if 'value' in request.data: obj.set_value(str(value))
    obj.enabled=bool(request.data.get('enabled',obj.enabled)); obj.updated_by=request.user; obj.save()
    AuditLog.objects.create(user=request.user,action='integration_setting_update',model_name='IntegrationSetting',object_id=str(obj.pk),details={'provider':provider,'key':key})
    return Response(IntegrationSettingSerializer(obj).data)


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def kyc_settings(request):
    """Organization-wide KYC requirement switch; disabled mode skips mandatory verification gates."""
    if not (request.user.is_staff or request.user.is_superuser):
        return Response({"detail": "Administrator access required."}, status=403)
    obj = IntegrationSetting.objects.filter(provider="sms", key="feature__kyc_required").first()
    if request.method == "GET":
        return Response({"kyc_required": True if obj is None else bool(obj.enabled)})
    value = request.data.get("kyc_required")
    if not isinstance(value, bool):
        return Response({"kyc_required": "Must be true or false."}, status=400)
    obj, _ = IntegrationSetting.objects.get_or_create(provider="sms", key="feature__kyc_required")
    obj.enabled = value
    obj.updated_by = request.user
    obj.save()
    AuditLog.objects.create(user=request.user, action="kyc_requirement_update", model_name="IntegrationSetting", object_id=str(obj.pk), details={"kyc_required": value})
    return Response({"kyc_required": bool(obj.enabled)})


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def sms_settings(request):
    """Admin/staff-managed SMS event toggles; credentials remain in IntegrationSetting."""
    if not request.user.is_staff:
        return Response({"detail": "Administrator access required."}, status=403)
    fields = [
        "sms_service", "customer_registration", "password_reset", "due_reminder",
        "member_verify_otp", "staff_verify_otp", "customer_loan_disbursement",
        "emi_collection", "document_verification", "customer_credentials",
        "guarantor_verify_otp", "staff_verify",
    ]
    if request.method == "GET":
        result = {key: True for key in fields}
        result["emi_reminder_days"] = 1
        for key in fields:
            obj = IntegrationSetting.objects.filter(provider="sms", key="feature__" + key).first()
            if obj is not None: result[key] = obj.enabled
        days = IntegrationSetting.objects.filter(provider="sms", key="emi_reminder_days").first()
        if days:
            try: result["emi_reminder_days"] = max(1, min(90, int(days.get_value() or 1)))
            except (TypeError, ValueError): result["emi_reminder_days"] = 1
        return Response(result)
    payload = request.data
    for key in fields:
        if key in payload and not isinstance(payload[key], bool):
            return Response({key: "Must be true or false."}, status=400)
    days = payload.get("emi_reminder_days", 1)
    try: days = int(days)
    except (TypeError, ValueError): return Response({"emi_reminder_days": "Enter a whole number from 1 to 90."}, status=400)
    if not 1 <= days <= 90: return Response({"emi_reminder_days": "Enter a whole number from 1 to 90."}, status=400)
    for key in fields:
        if key in payload:
            obj, _ = IntegrationSetting.objects.get_or_create(provider="sms", key="feature__" + key)
            obj.enabled = payload[key]; obj.updated_by = request.user; obj.save()
    obj, _ = IntegrationSetting.objects.get_or_create(provider="sms", key="emi_reminder_days")
    obj.set_value(str(days)); obj.enabled = True; obj.updated_by = request.user; obj.save()
    AuditLog.objects.create(user=request.user, action="sms_settings_update", model_name="IntegrationSetting", object_id="sms", details={"fields": list(fields), "emi_reminder_days": days})
    return Response({**{key: bool(payload.get(key, True)) for key in fields}, "emi_reminder_days": days})


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def profit_and_loss(request):
    denied=_deny_unless_feature(request,'view_accounting')
    if denied: return denied
    branch_denied=_deny_branch_global_accounting(request)
    if branch_denied: return branch_denied
    """Management P&L based only on accounts explicitly classified in Chart of Accounts."""
    return _classified_statement({'income','expense'}, request, 'profit_and_loss')

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def balance_sheet(request):
    denied=_deny_unless_feature(request,'view_accounting')
    if denied: return denied
    branch_denied=_deny_branch_global_accounting(request)
    if branch_denied: return branch_denied
    """Management balance sheet from classified journal balances; not statutory until reconciled."""
    return _classified_statement({'asset','liability','equity'}, request, 'balance_sheet')

def _classified_statement(types, request, statement):
    from django.db.models import Sum
    accounts=list(ChartOfAccount.objects.filter(active=True,account_type__in=types).order_by('code'))
    qs=_journal_queryset_for_request(request)
    as_of=request.query_params.get('as_of')
    from_date=request.query_params.get('from_date')
    to_date=request.query_params.get('to_date')
    if statement=='balance_sheet':
        if as_of: qs=qs.filter(date__lte=as_of)
    else:
        if from_date: qs=qs.filter(date__gte=from_date)
        if to_date: qs=qs.filter(date__lte=to_date)
    rows=[]; classified_names=set(); total=Decimal('0')
    for account in accounts:
        sums=qs.filter(account__iexact=account.name).aggregate(d=Sum('debit'),c=Sum('credit'))
        debit=sums['d'] or Decimal('0'); credit=sums['c'] or Decimal('0')
        # Assets and expenses normally carry debit balances; liabilities, equity and income carry credit balances.
        balance=(debit-credit) if account.account_type in {'asset','expense'} else (credit-debit)
        rows.append({'code':account.code,'account':account.name,'account_type':account.account_type,'debit':str(debit),'credit':str(credit),'balance':str(balance)})
        classified_names.add(account.name.casefold()); total+=balance
    journal_names=JournalEntry.objects.values_list('account',flat=True).distinct()
    unclassified=sorted({name for name in journal_names if name.casefold() not in classified_names})
    payload={'statement':statement,'rows':rows,'total':str(total),'unclassified_journal_accounts':unclassified,
             'complete':len(unclassified)==0,'basis':'classified journal entries only',
             'warning':'Management report only. Reconcile opening balances, bank statements, loan subledger and all unclassified accounts before relying on this as a final financial statement.'}
    if statement=='profit_and_loss':
        payload['income_total']=str(sum((Decimal(r['balance']) for r in rows if r['account_type']=='income'),Decimal('0')))
        payload['expense_total']=str(sum((Decimal(r['balance']) for r in rows if r['account_type']=='expense'),Decimal('0')))
        payload['net_result']=str(Decimal(payload['income_total'])-Decimal(payload['expense_total']))
    else:
        payload['assets_total']=str(sum((Decimal(r['balance']) for r in rows if r['account_type']=='asset'),Decimal('0')))
        payload['liabilities_total']=str(sum((Decimal(r['balance']) for r in rows if r['account_type']=='liability'),Decimal('0')))
        payload['equity_total']=str(sum((Decimal(r['balance']) for r in rows if r['account_type']=='equity'),Decimal('0')))
        payload['balance_difference']=str(Decimal(payload['assets_total'])-Decimal(payload['liabilities_total'])-Decimal(payload['equity_total']))
    return Response(payload)


class OrganizationProfileWritePermission(BasePermission):
    def has_permission(self, request, view):
        user=request.user
        if not user or not user.is_authenticated or not user.is_active:
            return False
        if user.is_superuser or user.is_staff:
            return True
        return _user_has_feature(user, 'manage_settings') or _user_has_feature(user, 'manage_company_settings')

class OrganizationProfileViewSet(viewsets.ModelViewSet):
    queryset=OrganizationProfile.objects.all().order_by('id')
    serializer_class=OrganizationProfileSerializer
    permission_classes=[AllowAny]
    http_method_names=['get','post','patch','put','head','options']
    def get_permissions(self):
        if getattr(self,'action','list') in {'create','update','partial_update'}:
            return [IsAuthenticated(),OrganizationProfileWritePermission()]
        return [AllowAny()]
    def get_queryset(self): return OrganizationProfile.objects.all().order_by('id')
    def perform_create(self,serializer):
        if OrganizationProfile.objects.exists():
            from rest_framework.exceptions import ValidationError
            raise ValidationError('Organization profile already exists. Edit the existing profile instead.')
        obj=serializer.save(); AuditLog.objects.create(user=self.request.user,action='create',model_name='OrganizationProfile',object_id=str(obj.pk),details={})
    def perform_update(self,serializer):
        obj=serializer.save(); AuditLog.objects.create(user=self.request.user,action='update',model_name='OrganizationProfile',object_id=str(obj.pk),details={'name':obj.name})

class AttendanceRecordViewSet(SecureModelViewSet):
    queryset=AttendanceRecord.objects.select_related('employee','employee__branch').all()
    serializer_class=AttendanceRecordSerializer
    def get_queryset(self):
        qs=super().get_queryset(); branch=_staff_branch_id(self.request.user)
        if branch is False: return qs.none()
        if branch is not None: qs=qs.filter(employee__branch_id=branch)
        return qs
    def perform_create(self,serializer): serializer.save(created_by=self.request.user)

class PayrollRecordViewSet(SecureModelViewSet):
    queryset=PayrollRecord.objects.select_related('employee','employee__branch').all()
    serializer_class=PayrollRecordSerializer
    def get_queryset(self):
        qs=super().get_queryset(); branch=_staff_branch_id(self.request.user)
        if branch is False: return qs.none()
        if branch is not None: qs=qs.filter(employee__branch_id=branch)
        return qs
    def get_permissions(self):
        # Payroll includes compensation data; only admin, manager or explicitly permitted accounting staff.
        return [IsAuthenticated(),StaffFeaturePermission()]
    def perform_create(self,serializer):
        obj=serializer.save(created_by=self.request.user); AuditLog.objects.create(user=self.request.user,action='payroll_create',model_name='PayrollRecord',object_id=str(obj.pk),details={'employee_id':obj.employee_id,'period_month':str(obj.period_month),'net_salary':str(obj.net_salary)})
    def perform_update(self,serializer):
        if self.get_object().status in {'paid','approved','rejected','cancelled'}:
            from rest_framework.exceptions import ValidationError
            raise ValidationError('Only draft payroll can be edited. Final decisions are kept in the approval audit trail.')
        obj=serializer.save(); AuditLog.objects.create(user=self.request.user,action='payroll_update',model_name='PayrollRecord',object_id=str(obj.pk),details={'status':obj.status})

    @action(detail=True,methods=['post'])
    @transaction.atomic
    def approve(self,request,pk=None):
        visible=self.get_object()
        item=PayrollRecord.objects.select_for_update().get(pk=visible.pk)
        if not _is_approval_manager(request.user):
            return Response({'detail':'Only an authorized HR/branch manager can approve salary payroll.'},status=403)
        if item.created_by_id and item.created_by_id==request.user.pk:
            return Response({'detail':'Maker-checker: the payroll creator cannot approve their own salary record.'},status=403)
        if item.status!='draft':
            return Response({'detail':'Only draft payroll can be approved.'},status=409)
        note,err=_approval_note(request)
        if err: return err
        item.status='approved'; item.approval_note=note; item.approved_by=request.user; item.approved_at=timezone.now()
        item.save(update_fields=['status','approval_note','approved_by','approved_at','updated_at'])
        AuditLog.objects.create(user=request.user,action='salary_payroll_approved',model_name='PayrollRecord',object_id=str(item.pk),details={'employee_id':item.employee_id,'period_month':str(item.period_month),'net_salary':str(item.net_salary),'approval_note':note})
        return Response(self.get_serializer(item).data)

    @action(detail=True,methods=['post'])
    @transaction.atomic
    def reject(self,request,pk=None):
        visible=self.get_object()
        item=PayrollRecord.objects.select_for_update().get(pk=visible.pk)
        if not _is_approval_manager(request.user):
            return Response({'detail':'Only an authorized HR/branch manager can reject salary payroll.'},status=403)
        if item.created_by_id and item.created_by_id==request.user.pk:
            return Response({'detail':'Maker-checker: the payroll creator cannot reject their own salary record.'},status=403)
        if item.status!='draft':
            return Response({'detail':'Only draft payroll can be rejected.'},status=409)
        note,err=_approval_note(request,required=True)
        if err: return err
        item.status='rejected'; item.approval_note=note; item.approved_by=request.user; item.approved_at=timezone.now()
        item.save(update_fields=['status','approval_note','approved_by','approved_at','updated_at'])
        AuditLog.objects.create(user=request.user,action='salary_payroll_rejected',model_name='PayrollRecord',object_id=str(item.pk),details={'employee_id':item.employee_id,'period_month':str(item.period_month),'reason':note})
        return Response(self.get_serializer(item).data)


class ProductLoanRequestViewSet(SecureModelViewSet):
    queryset=ProductLoanRequest.objects.select_related('member','member__branch').all()
    serializer_class=ProductLoanRequestSerializer
    def get_queryset(self):
        qs=super().get_queryset(); state=self.request.query_params.get('state')
        branch=_staff_branch_id(self.request.user)
        if branch is False: return qs.none()
        if branch is not None: qs=qs.filter(Q(from_branch_id=branch)|Q(to_branch_id=branch))
        return qs.filter(status=state).order_by('-created_at','-id') if state else qs.order_by('-created_at','-id')
    def perform_create(self,serializer):
        branch=_staff_branch_id(self.request.user)
        source=serializer.validated_data.get('from_branch')
        destination=serializer.validated_data.get('to_branch')
        if (source is None) != (destination is None) and branch is not None:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('Only an organization administrator may allocate or return funds between the unallocated ledger and a branch.')
        if branch is False:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('An active branch assignment is required to create a fund transfer.')
        if branch is not None:
            if source is None and destination is None:
                serializer.save(from_branch_id=branch,to_branch_id=branch)
            elif source.pk!=branch or destination.pk!=branch:
                from rest_framework.exceptions import PermissionDenied
                raise PermissionDenied('Branch staff may initiate transfers only within their assigned branch. Cross-branch transfers require an organization administrator.')
        item=serializer.save(created_by=self.request.user) if not serializer.instance else serializer.instance
        AuditLog.objects.create(user=self.request.user,action='product_loan_submitted',model_name='ProductLoanRequest',object_id=str(item.pk),details={'member_id':item.member_id,'product_name':item.product_name,'financed_amount':str(item.financed_amount)})
    def perform_update(self,serializer):
        if self.get_object().status!='pending':
            from rest_framework.exceptions import ValidationError
            raise ValidationError({'status':'Only pending product-loan requests can be edited.'})
        super().perform_update(serializer)
    @action(detail=True,methods=['post'])
    @transaction.atomic
    def approve(self,request,pk=None):
        visible=self.get_object(); item=ProductLoanRequest.objects.select_for_update().select_related('member').get(pk=visible.pk)
        if not _is_approval_manager(request.user): return Response({'detail':'Only an authorized loan manager can approve product-loan requests.'},status=403)
        if item.created_by_id and item.created_by_id==request.user.pk: return Response({'detail':'Maker-checker: the request creator cannot approve their own product-loan request.'},status=403)
        if item.status!='pending': return Response({'detail':'Only pending product-loan requests can be approved.'},status=409)
        if not item.member.active: return Response({'detail':'Inactive members cannot receive product-loan approval.'},status=400)
        if item.financed_amount<=0: return Response({'detail':'Financed amount must be greater than zero.'},status=400)
        if _kyc_is_required():
            gaps=_verified_kyc_gaps(item.member)
            if gaps: return Response(_kyc_error_detail(gaps,'product-loan approval'),status=400)
        note,err=_approval_note(request)
        if err: return err
        item.status='approved'; item.approval_note=note; item.approved_by=request.user; item.approved_at=timezone.now()
        item.save(update_fields=['status','approval_note','approved_by','approved_at','updated_at'])
        AuditLog.objects.create(user=request.user,action='product_loan_approved',model_name='ProductLoanRequest',object_id=str(item.pk),details={'member_id':item.member_id,'financed_amount':str(item.financed_amount),'tenure_installments':item.tenure_installments,'approval_note':note,'disbursement_created':False,'ledger_posted':False})
        return Response(self.get_serializer(item).data)
    @action(detail=True,methods=['post'])
    @transaction.atomic
    def reject(self,request,pk=None):
        visible=self.get_object(); item=ProductLoanRequest.objects.select_for_update().get(pk=visible.pk)
        if not _is_approval_manager(request.user): return Response({'detail':'Only an authorized loan manager can reject product-loan requests.'},status=403)
        if item.created_by_id and item.created_by_id==request.user.pk: return Response({'detail':'Maker-checker: the request creator cannot reject their own product-loan request.'},status=403)
        if item.status!='pending': return Response({'detail':'Only pending product-loan requests can be rejected.'},status=409)
        note,err=_approval_note(request,required=True)
        if err: return err
        item.status='rejected'; item.approval_note=note; item.approved_by=request.user; item.approved_at=timezone.now()
        item.save(update_fields=['status','approval_note','approved_by','approved_at','updated_at'])
        AuditLog.objects.create(user=request.user,action='product_loan_rejected',model_name='ProductLoanRequest',object_id=str(item.pk),details={'reason':note})
        return Response(self.get_serializer(item).data)


class FundsTransferRequestViewSet(SecureModelViewSet):
    queryset=FundsTransferRequest.objects.all()
    serializer_class=FundsTransferRequestSerializer
    http_method_names=['get','post','patch','put','head','options']
    def get_queryset(self):
        qs=super().get_queryset(); state=self.request.query_params.get('state')
        branch=_staff_branch_id(self.request.user)
        if branch is False: return qs.none()
        if branch is not None: qs=qs.filter(Q(from_branch_id=branch)|Q(to_branch_id=branch))
        return qs.filter(status=state).order_by('-created_at','-id') if state else qs.order_by('-created_at','-id')
    def perform_create(self,serializer):
        branch=_staff_branch_id(self.request.user)
        source=serializer.validated_data.get('from_branch')
        destination=serializer.validated_data.get('to_branch')
        if (source is None) != (destination is None) and branch is not None:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('Only an organization administrator may allocate or return funds between the unallocated ledger and a branch.')
        if branch is False:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('An active branch assignment is required to create a fund transfer.')
        save_kwargs={'created_by':self.request.user}
        if branch is not None:
            if source is None and destination is None:
                assigned_branch=Branch.objects.get(pk=branch)
                save_kwargs.update(from_branch=assigned_branch,to_branch=assigned_branch)
            elif source.pk!=branch or destination.pk!=branch:
                from rest_framework.exceptions import PermissionDenied
                raise PermissionDenied('Branch staff may initiate transfers only within their assigned branch. Cross-branch transfers require an organization administrator.')
        item=serializer.save(**save_kwargs)
        if not item.reference:
            item.reference=f'FTR-{item.pk:08d}'
            item.save(update_fields=['reference','updated_at'])
        AuditLog.objects.create(user=self.request.user,action='fund_transfer_submitted',model_name='FundsTransferRequest',object_id=str(item.pk),details={'from_account':item.from_account,'to_account':item.to_account,'from_branch_id':item.from_branch_id,'to_branch_id':item.to_branch_id,'amount':str(item.amount),'reference':item.reference})
    def perform_update(self,serializer):
        current=self.get_object()
        if current.status!='pending':
            from rest_framework.exceptions import ValidationError
            raise ValidationError({'status':'Only pending fund-transfer requests can be edited.'})
        branch=_staff_branch_id(self.request.user)
        if current.created_by_id!=self.request.user.pk and branch is not None:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('Only the transfer creator or organization administrator may edit this pending request.')
        super().perform_update(serializer)
    @action(detail=True,methods=['post'])
    @transaction.atomic
    def approve(self,request,pk=None):
        visible=self.get_object(); item=FundsTransferRequest.objects.select_for_update().get(pk=visible.pk)
        if not _is_approval_manager(request.user): return Response({'detail':'Only an authorized accounting manager can approve fund transfers.'},status=403)
        if item.created_by_id and item.created_by_id==request.user.pk: return Response({'detail':'Maker-checker: the transfer creator cannot approve their own transfer.'},status=403)
        if item.status!='pending': return Response({'detail':'Only pending fund transfers can be approved.'},status=409)
        if item.from_account.strip().casefold()==item.to_account.strip().casefold() and item.from_branch_id==item.to_branch_id: return Response({'to_account':'Source and destination accounts must differ unless this is a transfer between different branches.'},status=400)
        for field,account_name in (('from_account',item.from_account),('to_account',item.to_account)):
            configured=ChartOfAccount.objects.filter(name__iexact=account_name).first()
            normal=account_name.strip().casefold()
            reserved=normal in {'cash','bank','upi clearing','card clearing','gateway clearing'} or normal.startswith('bank:')
            if configured and (not configured.active or configured.account_type!='asset'):
                return Response({field:'Fund transfers can only use active asset ledger accounts.'},status=400)
            if not configured and not reserved:
                return Response({field:'Configure this account as an active asset in Chart of Accounts before transferring funds.'},status=400)
        if JournalEntry.objects.filter(reference__iexact=item.reference).exists(): return Response({'detail':'This reference already exists in the ledger. No new posting was made; reconcile the reference first.'},status=409)
        # Serialize balance checks by account; branch-tagged balances are never mixed
        # with legacy unallocated entries. A branch transfer must use a branch-scoped source balance.
        _locked_ledger_balance([item.from_account,item.to_account])
        rows=list(JournalEntry.objects.filter(Q(account__iexact=item.from_account)|Q(account__iexact=item.to_account)).order_by('id'))
        source_name=next((r.account for r in rows if r.account.casefold()==item.from_account.casefold()),item.from_account)
        dest_name=next((r.account for r in rows if r.account.casefold()==item.to_account.casefold()),item.to_account)
        acting_branch=_staff_branch_id(request.user)
        if item.from_branch_id!=item.to_branch_id and acting_branch is not None:
            return Response({'detail':'Cross-branch transfers require organization-admin approval.'},status=403)
        locked_balance=_ledger_balance(source_name,branch=item.from_branch_id,branch_scoped=True)
        if locked_balance<item.amount:
            return Response({'amount':f'Insufficient available balance in {source_name} for selected source branch. Available: {locked_balance:.2f}; requested: {item.amount:.2f}.'},status=400)
        note,err=_approval_note(request)
        if err: return err
        _post_pair(date=item.date,debit_account=dest_name,credit_account=source_name,amount=item.amount,reference=item.reference,note=f'Approved internal fund transfer {item.reference}: {item.note}',debit_branch=item.to_branch,credit_branch=item.from_branch)
        item.status='approved'; item.approval_note=note; item.approved_by=request.user; item.approved_at=timezone.now()
        item.save(update_fields=['status','approval_note','approved_by','approved_at','updated_at'])
        AuditLog.objects.create(user=request.user,action='fund_transfer_approved',model_name='FundsTransferRequest',object_id=str(item.pk),details={'reference':item.reference,'from_account':source_name,'to_account':dest_name,'from_branch_id':item.from_branch_id,'to_branch_id':item.to_branch_id,'amount':str(item.amount),'approval_note':note,'ledger_lines':2})
        return Response(self.get_serializer(item).data)
    @action(detail=True,methods=['post'])
    @transaction.atomic
    def reject(self,request,pk=None):
        visible=self.get_object(); item=FundsTransferRequest.objects.select_for_update().get(pk=visible.pk)
        if not _is_approval_manager(request.user): return Response({'detail':'Only an authorized accounting manager can reject fund transfers.'},status=403)
        if item.created_by_id and item.created_by_id==request.user.pk: return Response({'detail':'Maker-checker: the transfer creator cannot reject their own transfer.'},status=403)
        if item.status!='pending': return Response({'detail':'Only pending fund transfers can be rejected.'},status=409)
        note,err=_approval_note(request,required=True)
        if err: return err
        item.status='rejected'; item.approval_note=note; item.approved_by=request.user; item.approved_at=timezone.now()
        item.save(update_fields=['status','approval_note','approved_by','approved_at','updated_at'])
        AuditLog.objects.create(user=request.user,action='fund_transfer_rejected',model_name='FundsTransferRequest',object_id=str(item.pk),details={'reference':item.reference,'from_branch_id':item.from_branch_id,'to_branch_id':item.to_branch_id,'reason':note})
        return Response(self.get_serializer(item).data)


def _overdue_snapshot(loan, today=None):
    """Compute outstanding overdue installments using unpaid principal/interest/penalty only."""
    today=today or timezone.localdate()
    rows=list(Installment.objects.filter(loan=loan,due_date__lt=today).exclude(status__iexact='paid').order_by('due_date','number'))
    amount=Decimal('0.00')
    count=0
    for row in rows:
        remaining=(max(Decimal('0'),row.principal_due-row.principal_paid)
                   +max(Decimal('0'),row.interest_due-row.interest_paid)
                   +max(Decimal('0'),row.penalty_due-row.penalty_paid))
        if remaining>0:
            amount+=remaining
            count+=1
    return amount.quantize(Decimal('0.01')),count


def _effective_recovery_assignment(loan):
    assignment=LoanRecoveryAssignment.objects.filter(loan=loan).select_related('branch','employee').first()
    if assignment:
        return assignment.branch,assignment.employee
    return loan.member.branch,loan.member.field_officer


def _is_organization_admin(user):
    if not user or not user.is_authenticated or not user.is_active:
        return False
    if user.is_superuser or user.is_staff:
        return True
    profile=getattr(user,'staff_profile',None)
    return bool(profile and profile.active and profile.role=='admin')


class OverdueTransferRequestViewSet(SecureModelViewSet):
    queryset=OverdueTransferRequest.objects.select_related('loan','loan__member','from_branch','to_branch','from_employee','to_employee','created_by','decided_by').all()
    serializer_class=OverdueTransferRequestSerializer
    http_method_names=['get','post','head','options']

    def get_queryset(self):
        # Do not call SecureModelViewSet's generic scoping: this model is scoped to either
        # side of the transfer, rather than to a single `branch` field.
        qs=OverdueTransferRequest.objects.select_related('loan','loan__member','from_branch','to_branch','from_employee','to_employee','created_by','decided_by').all()
        branch=_staff_branch_id(self.request.user)
        if branch is False: return qs.none()
        if branch is not None: qs=qs.filter(Q(from_branch_id=branch)|Q(to_branch_id=branch))
        state=(self.request.query_params.get('state') or '').strip()
        return qs.filter(status=state) if state in {'pending','approved','rejected'} else qs

    def create(self,request,*args,**kwargs):
        key=str(request.data.get('idempotency_key') or '').strip()
        if not key or len(key)>100:
            return Response({'idempotency_key':'A unique idempotency key is required.'},status=400)
        existing=OverdueTransferRequest.objects.filter(idempotency_key=key).first()
        if existing:
            try:
                same_payload=(existing.loan_id==int(request.data.get('loan')) and existing.to_branch_id==int(request.data.get('to_branch')) and existing.to_employee_id==int(request.data.get('to_employee')))
            except (TypeError,ValueError):
                same_payload=False
            if existing.created_by_id==request.user.pk and same_payload and existing.reason==str(request.data.get('reason') or '').strip():
                return Response(self.get_serializer(existing).data,status=200)
            return Response({'detail':'Idempotency key already used for a different request.'},status=409)
        serializer=self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        branch_id=_staff_branch_id(request.user)
        if branch_id is False:
            return Response({'detail':'An active branch assignment or administrator access is required.'},status=403)
        loan=serializer.validated_data['loan']
        target_branch=serializer.validated_data['to_branch']
        target_employee=serializer.validated_data['to_employee']
        if not target_branch.active or not target_employee.active or target_employee.branch_id!=target_branch.pk:
            return Response({'to_employee':'Choose an active employee assigned to the active destination branch.'},status=400)
        with transaction.atomic():
            loan=Loan.objects.select_for_update().select_related('member','member__branch','member__field_officer').filter(pk=loan.pk).first()
            if not loan or loan.status not in {'disbursed','restructured'}:
                return Response({'loan':'Only an active disbursed/restructured loan can be transferred for overdue recovery.'},status=400)
            source_branch,source_employee=_effective_recovery_assignment(loan)
            if branch_id is not None and source_branch.pk!=branch_id:
                return Response({'detail':'You may transfer only overdue cases currently assigned to your branch.'},status=403)
            if target_branch.pk!=source_branch.pk and not _is_organization_admin(request.user):
                return Response({'detail':'Cross-branch overdue transfers must be initiated by an organization administrator.'},status=403)
            if target_branch.pk==source_branch.pk and source_employee and target_employee.pk==source_employee.pk:
                return Response({'to_employee':'Choose a different active staff member; the current assignment already matches.'},status=400)
            amount,count=_overdue_snapshot(loan)
            if amount<=0 or count<=0:
                return Response({'detail':'This loan has no unpaid overdue installments. Refresh the overdue queue.'},status=409)
            try:
                # Nested atomic creates a savepoint so a unique-constraint race can be
                # converted into HTTP 409 without poisoning the outer transaction.
                with transaction.atomic():
                    item=serializer.save(from_branch=source_branch,from_employee=source_employee,overdue_amount_snapshot=amount,overdue_installments_snapshot=count,created_by=request.user)
            except Exception as exc:
                from django.db import IntegrityError
                if isinstance(exc,IntegrityError):
                    return Response({'detail':'A pending transfer already exists for this loan, or this idempotency key was already used.'},status=409)
                raise
            AuditLog.objects.create(user=request.user,action='overdue_transfer_submitted',model_name='OverdueTransferRequest',object_id=str(item.pk),details={'loan_id':loan.pk,'from_branch_id':source_branch.pk,'to_branch_id':target_branch.pk,'from_employee_id':source_employee.pk if source_employee else None,'to_employee_id':target_employee.pk,'reason':item.reason,'overdue_amount_snapshot':str(amount),'overdue_installments_snapshot':count,'accounting_posted':False})
        return Response(self.get_serializer(item).data,status=201)

    @action(detail=False,methods=['get'])
    def queue(self,request):
        if not (_user_has_feature(request.user,'view_loans') or _user_has_feature(request.user,'view_overdue_transfers') or _user_has_feature(request.user,'manage_overdue_transfers') or _user_has_feature(request.user,'approve_overdue_transfers')):
            return Response({'detail':'Overdue recovery view permission is required.'},status=403)
        branch_id=_staff_branch_id(request.user)
        if branch_id is False: return Response([],status=200)
        loans=Loan.objects.filter(status__in=['disbursed','restructured']).select_related('member','member__branch','member__field_officer','product').order_by('id')
        result=[]
        today=timezone.localdate()
        for loan in loans.iterator():
            current_branch,current_employee=_effective_recovery_assignment(loan)
            if branch_id is not None and current_branch.pk!=branch_id: continue
            amount,count=_overdue_snapshot(loan,today)
            if amount<=0 or count<=0: continue
            pending=OverdueTransferRequest.objects.filter(loan=loan,status='pending').values('id').first()
            result.append({'loan':loan.pk,'member_id':loan.member_id,'member_name':loan.member.name,'member_no':loan.member.member_no,'source_branch':current_branch.pk,'source_branch_name':current_branch.name,'source_employee':current_employee.pk if current_employee else None,'source_employee_name':current_employee.name if current_employee else '', 'overdue_amount':str(amount),'overdue_installments':count,'pending_transfer_id':pending['id'] if pending else None})
        return Response(result)

    @action(detail=True,methods=['post'])
    @transaction.atomic
    def approve(self,request,pk=None):
        visible=self.get_object()
        item=OverdueTransferRequest.objects.select_for_update().select_related('loan','to_branch','to_employee').get(pk=visible.pk)
        if not _user_has_feature(request.user,'approve_overdue_transfers') and not _user_has_feature(request.user,'manage_overdue_transfers'):
            return Response({'detail':'Overdue-transfer approval permission is required.'},status=403)
        if item.created_by_id==request.user.pk:
            return Response({'detail':'Maker-checker: the requester cannot approve their own overdue transfer.'},status=403)
        if item.status!='pending': return Response({'detail':'Only pending overdue transfers can be approved.'},status=409)
        if item.from_branch_id!=item.to_branch_id and not _is_organization_admin(request.user):
            return Response({'detail':'Cross-branch overdue transfers require organization-admin approval.'},status=403)
        loan=Loan.objects.select_for_update().select_related('member','member__branch','member__field_officer').get(pk=item.loan_id)
        current_branch,current_employee=_effective_recovery_assignment(loan)
        if current_branch.pk!=item.from_branch_id or (current_employee.pk if current_employee else None)!=(item.from_employee_id):
            return Response({'detail':'The current recovery assignment changed after this request. Reject and create a fresh transfer.'},status=409)
        if loan.status not in {'disbursed','restructured'} or not item.to_branch.active or not item.to_employee.active or item.to_employee.branch_id!=item.to_branch_id:
            return Response({'detail':'Loan or destination branch/staff is no longer eligible.'},status=409)
        amount,count=_overdue_snapshot(loan)
        if amount<=0 or count<=0:
            return Response({'detail':'The overdue has been cleared; transfer cannot be approved.'},status=409)
        note=str(request.data.get('approval_note') or '').strip()
        if len(note)<5:
            return Response({'approval_note':'Approval note must be at least 5 characters.'},status=400)
        assignment,created=LoanRecoveryAssignment.objects.select_for_update().get_or_create(loan=loan,defaults={'branch':item.to_branch,'employee':item.to_employee,'updated_by':request.user,'source_transfer':item})
        if not created:
            assignment.branch=item.to_branch; assignment.employee=item.to_employee; assignment.updated_by=request.user; assignment.source_transfer=item
            assignment.save(update_fields=['branch','employee','updated_by','source_transfer','updated_at'])
        item.status='approved'; item.decision_note=note; item.decided_by=request.user; item.decided_at=timezone.now()
        item.save(update_fields=['status','decision_note','decided_by','decided_at','updated_at'])
        AuditLog.objects.create(user=request.user,action='overdue_transfer_approved',model_name='OverdueTransferRequest',object_id=str(item.pk),details={'loan_id':loan.pk,'from_branch_id':item.from_branch_id,'to_branch_id':item.to_branch_id,'from_employee_id':item.from_employee_id,'to_employee_id':item.to_employee_id,'reason':item.reason,'decision_note':note,'overdue_amount_at_approval':str(amount),'overdue_installments_at_approval':count,'accounting_posted':False,'loan_and_member_branch_unchanged':True})
        return Response(self.get_serializer(item).data)

    @action(detail=True,methods=['post'])
    @transaction.atomic
    def reject(self,request,pk=None):
        visible=self.get_object()
        item=OverdueTransferRequest.objects.select_for_update().get(pk=visible.pk)
        if not _user_has_feature(request.user,'approve_overdue_transfers') and not _user_has_feature(request.user,'manage_overdue_transfers'):
            return Response({'detail':'Overdue-transfer decision permission is required.'},status=403)
        if item.created_by_id==request.user.pk:
            return Response({'detail':'Maker-checker: the requester cannot reject their own overdue transfer.'},status=403)
        if item.status!='pending': return Response({'detail':'Only pending overdue transfers can be rejected.'},status=409)
        if item.from_branch_id!=item.to_branch_id and not _is_organization_admin(request.user):
            return Response({'detail':'Cross-branch overdue transfers require organization-admin decision.'},status=403)
        note=str(request.data.get('approval_note') or request.data.get('reason') or '').strip()
        if len(note)<5:
            return Response({'approval_note':'Rejection reason must be at least 5 characters.'},status=400)
        item.status='rejected'; item.decision_note=note; item.decided_by=request.user; item.decided_at=timezone.now()
        item.save(update_fields=['status','decision_note','decided_by','decided_at','updated_at'])
        AuditLog.objects.create(user=request.user,action='overdue_transfer_rejected',model_name='OverdueTransferRequest',object_id=str(item.pk),details={'loan_id':item.loan_id,'from_branch_id':item.from_branch_id,'to_branch_id':item.to_branch_id,'from_employee_id':item.from_employee_id,'to_employee_id':item.to_employee_id,'reason':item.reason,'decision_note':note,'accounting_posted':False})
        return Response(self.get_serializer(item).data)


class ReferenceMasterViewSet(SecureModelViewSet):
    queryset=ReferenceMaster.objects.all()
    serializer_class=ReferenceMasterSerializer
    def get_queryset(self):
        qs=super().get_queryset()
        kind=self.request.query_params.get('kind')
        allowed={'identity_proof','relation','purpose','reason','designation'}
        if kind: return qs.filter(kind=kind) if kind in allowed else qs.none()
        return qs
    def perform_destroy(self,obj):
        # Preserve reference values already stored on members, applications and KYC.
        if obj.kind=='identity_proof' and KycDocument.objects.filter(document_type__iexact=__import__('re').sub(r'[^a-z0-9]+','-',__import__('unicodedata').normalize('NFKD',obj.name).encode('ascii','ignore').decode('ascii').lower()).strip('-')[:40].strip('-')).exists():
            from rest_framework.exceptions import ValidationError
            raise ValidationError({'detail':'This identity proof has historical KYC records. Deactivate it instead of deleting it.'})
        super().perform_destroy(obj)


class MasterCatalogEntryViewSet(SecureModelViewSet):
    queryset=MasterCatalogEntry.objects.all()
    serializer_class=MasterCatalogEntrySerializer
    def get_queryset(self):
        qs=super().get_queryset()
        key=self.request.query_params.get('master_key')
        allowed={k for k,_ in MasterCatalogEntry.MASTER_KEYS}
        if key: return qs.filter(master_key=key) if key in allowed else qs.none()
        return qs
    def perform_destroy(self,obj):
        if obj.master_key=='document_type' and KycDocument.objects.filter(document_type__iexact=obj.code).exists():
            from rest_framework.exceptions import ValidationError
            raise ValidationError({'detail':'This document type is referenced by KYC records. Deactivate it instead of deleting it.'})
        if obj.master_key=='collection_mode' and Payment.objects.filter(method__iexact=obj.code).exists():
            from rest_framework.exceptions import ValidationError
            raise ValidationError({'detail':'This collection mode is referenced by payments. Deactivate it instead of deleting it.'})
        super().perform_destroy(obj)

class PenaltySchemeViewSet(SecureModelViewSet):
    queryset=PenaltyScheme.objects.all()
    serializer_class=PenaltySchemeSerializer
    def perform_destroy(self,obj):
        if obj.loan_products.exists() or obj.assessments.exists():
            from rest_framework.exceptions import ValidationError
            raise ValidationError({'detail':'This penalty scheme has linked loan plans or assessment history. Deactivate it only when contractual rules permit; do not delete its audit trail.'})
        super().perform_destroy(obj)
    @action(detail=True,methods=['post'],url_path='preview')
    def preview(self,request,pk=None):
        scheme=self.get_object()
        try:
            amount=Decimal(str(request.data.get('overdue_amount','0')))
            day_value=Decimal(str(request.data.get('overdue_days',0)))
            if not day_value.is_finite() or day_value != day_value.to_integral_value():
                raise ValueError('days must be a whole number')
            days=int(day_value)
        except (InvalidOperation,TypeError,ValueError):
            return Response({'detail':'Enter a valid overdue amount and whole number of overdue days.'},status=status.HTTP_400_BAD_REQUEST)
        if not amount.is_finite() or amount<0 or amount>Decimal('999999999999.99') or days<0 or days>36500:
            return Response({'detail':'Overdue amount must be between 0 and INR 999,999,999,999.99, and overdue days must be between 0 and 36500.'},status=status.HTTP_400_BAD_REQUEST)
        already=request.data.get('already_assessed',False)
        if not isinstance(already,bool):
            return Response({'already_assessed':'This field must be true or false.'},status=status.HTTP_400_BAD_REQUEST)
        try:
            charge=scheme.calculate_penalty(amount,days,already_assessed=already)
        except (ValueError,ArithmeticError) as exc:
            return Response({'detail':str(exc)},status=status.HTTP_400_BAD_REQUEST)
        return Response({'scheme_id':scheme.pk,'overdue_amount':str(amount.quantize(Decimal('0.01'),ROUND_HALF_UP)),'overdue_days':days,'grace_period_days':scheme.grace_period_days,'minimum_due_met':amount>=scheme.minimum_due_amount,'already_assessed':already,'penalty_amount':str(charge),'currency':'INR','posted':False,'note':'Preview only. No penalty was posted to an installment or ledger.'})



class PenaltyAssessmentViewSet(viewsets.ReadOnlyModelViewSet):
    """Read-only audit history of penalty entries posted by the scheduled command."""
    queryset=PenaltyAssessment.objects.select_related('scheme','installment','installment__loan','installment__loan__member','installment__loan__product').all()
    serializer_class=PenaltyAssessmentSerializer
    permission_classes=[IsAuthenticated,StaffFeaturePermission]

class SoftwareTimingViewSet(SecureModelViewSet):
    queryset=SoftwareTiming.objects.all()
    serializer_class=SoftwareTimingSerializer
    def perform_create(self,serializer):
        if SoftwareTiming.objects.exists():
            from rest_framework.exceptions import ValidationError
            raise ValidationError({'detail':'A software timing profile already exists. Edit the existing profile instead.'})
        super().perform_create(serializer)

class FinancialSessionViewSet(SecureModelViewSet):
    queryset=FinancialSession.objects.all()
    serializer_class=FinancialSessionSerializer

@api_view(['GET','PATCH'])
@permission_classes([IsAuthenticated])
def business_settings(request):
    if not request.user.is_staff and not request.user.is_superuser:
        return Response({'detail':'Administrator access required.'},status=status.HTTP_403_FORBIDDEN)
    obj,_=BusinessSettings.objects.get_or_create(key='default')
    if request.method=='GET':
        return Response(BusinessSettingsSerializer(obj).data)
    serializer=BusinessSettingsSerializer(obj,data={'values':request.data.get('values',{})},partial=True)
    serializer.is_valid(raise_exception=True)
    serializer.save(updated_by=request.user)
    AuditLog.objects.create(user=request.user,action='business_settings_update',model_name='BusinessSettings',object_id=str(obj.pk),details={'keys':sorted(list(request.data.get('values',{}).keys())) if isinstance(request.data.get('values',{}),dict) else []})
    return Response(BusinessSettingsSerializer(obj).data)

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def sms_test(request):
    """Send a real test SMS only when an HTTPS gateway URL, API key and sender ID are configured.

    Provider-specific gateways may have different payload contracts. This generic adapter sends
    JSON {api_key, sender_id, to, message}; success means the gateway HTTP-accepted the request,
    not proof of delivery to the handset.
    """
    if not request.user.is_staff and not request.user.is_superuser:
        return Response({'detail':'Administrator access required.'},status=status.HTTP_403_FORBIDDEN)
    import json, re, urllib.request, urllib.error
    phone=str(request.data.get('phone','')).strip().replace(' ','').replace('-','')
    message=str(request.data.get('message','')).strip()
    if phone.startswith('+91'): phone=phone[3:]
    if not re.fullmatch(r'[6-9][0-9]{9}',phone):
        return Response({'phone':'Enter a valid 10-digit Indian mobile number.'},status=status.HTTP_400_BAD_REQUEST)
    if not message or len(message)>1000:
        return Response({'message':'Message is required and must be 1000 characters or fewer.'},status=status.HTTP_400_BAD_REQUEST)
    cfg=BusinessSettings.objects.filter(key='default').first()
    url=(cfg.values or {}).get('sms_gateway_url','') if cfg else ''
    if not url:
        saved_url=IntegrationSetting.objects.filter(provider='sms',key='api_url',enabled=True).first()
        url=saved_url.get_value() if saved_url else ''
    api_key=IntegrationSetting.objects.filter(provider='sms',key='api_key',enabled=True).first()
    sender=IntegrationSetting.objects.filter(provider='sms',key='sender_id',enabled=True).first()
    if not url or not url.startswith('https://') or not api_key or not sender:
        return Response({'detail':'SMS gateway is not ready. Configure HTTPS SMS Gateway URL, enabled API Key and Sender ID first.'},status=status.HTTP_409_CONFLICT)
    try:
        payload=json.dumps({'api_key':api_key.get_value(),'sender_id':sender.get_value(),'to':phone,'message':message}).encode('utf-8')
        req=urllib.request.Request(url,data=payload,headers={'Content-Type':'application/json','Accept':'application/json'},method='POST')
        with urllib.request.urlopen(req,timeout=8) as resp:
            status_code=getattr(resp,'status',200)
            body=resp.read(2048).decode('utf-8','replace')
            if not 200<=status_code<300:
                return Response({'detail':'SMS gateway rejected the request.','gateway_status':status_code},status=status.HTTP_502_BAD_GATEWAY)
            AuditLog.objects.create(user=request.user,action='sms_test_gateway_accepted',model_name='SMS',object_id=phone[-4:],details={'gateway_status':status_code})
            return Response({'accepted_by_gateway':True,'gateway_status':status_code,'detail':'Gateway accepted the test message. Delivery to handset is not confirmed.'})
    except urllib.error.HTTPError as exc:
        return Response({'detail':'SMS gateway rejected the test request.','gateway_status':exc.code},status=status.HTTP_502_BAD_GATEWAY)
    except Exception:
        return Response({'detail':'SMS gateway request failed or timed out. Check endpoint configuration and server network logs.'},status=status.HTTP_502_BAD_GATEWAY)

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def change_current_user_password(request):
    """Change the authenticated user's password after verifying the current password."""
    current_password = str(request.data.get('current_password') or '')
    new_password = str(request.data.get('new_password') or '')
    if not request.user.check_password(current_password):
        return Response({'detail': 'Current password is incorrect.'}, status=status.HTTP_400_BAD_REQUEST)
    if len(new_password) < 12:
        return Response({'detail': 'New password must contain at least 12 characters.'}, status=status.HTTP_400_BAD_REQUEST)
    if new_password == current_password:
        return Response({'detail': 'New password must be different from the current password.'}, status=status.HTTP_400_BAD_REQUEST)
    request.user.set_password(new_password)
    request.user.save(update_fields=['password'])
    return Response({'detail': 'Password changed successfully. Sign in again using your new password.'}, status=status.HTTP_200_OK)


class SeriesConfigurationViewSet(SecureModelViewSet):
    queryset=SeriesConfiguration.objects.all().order_by('id')
    serializer_class=SeriesConfigurationSerializer
    def get_permissions(self):
        # Numbering configuration is organization-wide and admin-only to prevent branch staff changing IDs.
        return [IsAuthenticated(), IsAdminUser()]
    def perform_update(self, serializer):
        serializer.save()
        AuditLog.objects.create(user=self.request.user, action='series_configuration_updated', model_name='SeriesConfiguration', object_id=str(serializer.instance.pk), details={'key':serializer.instance.key,'prefix':serializer.instance.prefix,'next_number':serializer.instance.next_number})


class HouseholdIncomeAssessmentViewSet(SecureModelViewSet):
    queryset=HouseholdIncomeAssessment.objects.select_related('member','member__branch','assessed_by','verified_by').all()
    serializer_class=HouseholdIncomeAssessmentSerializer
    def perform_create(self,serializer):
        obj=serializer.save(assessed_by=self.request.user)
        AuditLog.objects.create(user=self.request.user,action='household_assessment_create',model_name='HouseholdIncomeAssessment',object_id=str(obj.pk),details={'member_id':obj.member_id,'assessment_date':str(obj.assessment_date)})
    @action(detail=True,methods=['post'])
    def verify(self,request,pk=None):
        denied=_deny_unless_feature(request,'verify_household_assessments')
        if denied:return denied
        obj=self.get_object()
        if obj.verified:return Response(HouseholdIncomeAssessmentSerializer(obj).data)
        if obj.assessed_by_id == request.user.id:
            return Response({'detail':'Maker-checker: the assessment creator cannot verify their own household assessment.'},status=403)
        note=str(request.data.get('verification_note') or '').strip()
        if len(note)<5:return Response({'verification_note':'Provide a verification note of at least 5 characters.'},status=400)
        obj.verified=True;obj.verification_note=note;obj.verified_by=request.user;obj.verified_at=timezone.now();obj.save(update_fields=['verified','verification_note','verified_by','verified_at','updated_at'])
        AuditLog.objects.create(user=request.user,action='household_assessment_verify',model_name='HouseholdIncomeAssessment',object_id=str(obj.pk),details={'member_id':obj.member_id,'repayment_ratio_percent':str(((obj.existing_monthly_loan_obligations+obj.proposed_monthly_obligation)*100/obj.monthly_household_income) if obj.monthly_household_income else 0)})
        return Response(HouseholdIncomeAssessmentSerializer(obj).data)


class CustomerComplaintViewSet(SecureModelViewSet):
    queryset=CustomerComplaint.objects.select_related('branch','member','assigned_employee','created_by','resolved_by').all()
    serializer_class=CustomerComplaintSerializer
    def perform_create(self,serializer):
        import uuid
        obj=serializer.save(complaint_no='CMP-'+timezone.localdate().strftime('%Y%m%d')+'-'+uuid.uuid4().hex[:8].upper(),created_by=self.request.user)
        AuditLog.objects.create(user=self.request.user,action='complaint_create',model_name='CustomerComplaint',object_id=str(obj.pk),details={'complaint_no':obj.complaint_no,'branch_id':obj.branch_id,'category':obj.category})
    def perform_update(self,serializer):
        before=self.get_object(); old_status=before.status
        obj=serializer.save()
        if obj.status in {'resolved','rejected'} and old_status not in {'resolved','rejected'}:
            obj.resolved_by=self.request.user;obj.resolved_at=timezone.now();obj.save(update_fields=['resolved_by','resolved_at','updated_at'])
        AuditLog.objects.create(user=self.request.user,action='complaint_update',model_name='CustomerComplaint',object_id=str(obj.pk),details={'status':obj.status,'branch_id':obj.branch_id})


class FieldVisitRecordViewSet(SecureModelViewSet):
    http_method_names=['get','post','head','options']
    queryset=FieldVisitRecord.objects.select_related('member','member__branch','loan','employee','created_by').all()
    serializer_class=FieldVisitRecordSerializer
    def perform_create(self,serializer):
        obj=serializer.save(created_by=self.request.user)
        AuditLog.objects.create(user=self.request.user,action='field_visit_create',model_name='FieldVisitRecord',object_id=str(obj.pk),details={'member_id':obj.member_id,'loan_id':obj.loan_id,'employee_id':obj.employee_id,'outcome':obj.outcome})
    def perform_destroy(self,obj):
        from rest_framework.exceptions import PermissionDenied
        raise PermissionDenied('Field visit records are retained for audit and cannot be deleted.')


class CashHandoverRequestViewSet(SecureModelViewSet):
    queryset=CashHandoverRequest.objects.select_related('branch','from_employee','to_employee','created_by','decided_by').all()
    serializer_class=CashHandoverRequestSerializer
    def perform_create(self,serializer):
        obj=serializer.save(created_by=self.request.user)
        AuditLog.objects.create(user=self.request.user,action='cash_handover_submit',model_name='CashHandoverRequest',object_id=str(obj.pk),details={'branch_id':obj.branch_id,'amount':str(obj.amount),'from_employee_id':obj.from_employee_id,'to_employee_id':obj.to_employee_id})
    def perform_update(self,serializer):
        if self.get_object().status!='pending':
            from rest_framework.exceptions import ValidationError
            raise ValidationError({'status':'Only pending cash handovers can be edited.'})
        serializer.save()
    def perform_destroy(self,obj):
        from rest_framework.exceptions import PermissionDenied
        raise PermissionDenied('Cash handover records are retained for audit and cannot be deleted.')
    @action(detail=True,methods=['post'])
    def approve(self,request,pk=None):
        denied=_deny_unless_feature(request,'approve_cash_handovers')
        if denied:return denied
        with transaction.atomic():
            visible=self.get_object()
            obj=CashHandoverRequest.objects.select_for_update().get(pk=visible.pk)
            if obj.status!='pending':return Response({'detail':'Only pending handovers can be approved.'},status=400)
            if obj.created_by_id==request.user.id:return Response({'detail':'Maker-checker: the creator cannot approve their own cash handover.'},status=403)
            if not obj.branch.active or not obj.from_employee.active or not obj.to_employee.active:return Response({'detail':'Branch and both employees must be active.'},status=400)
            note=str(request.data.get('decision_note') or '').strip()
            if len(note)<5:return Response({'decision_note':'Approval note of at least 5 characters is required.'},status=400)
            obj.status='approved';obj.decision_note=note;obj.decided_by=request.user;obj.decided_at=timezone.now();obj.save(update_fields=['status','decision_note','decided_by','decided_at','updated_at'])
            AuditLog.objects.create(user=request.user,action='cash_handover_approve',model_name='CashHandoverRequest',object_id=str(obj.pk),details={'branch_id':obj.branch_id,'amount':str(obj.amount),'journal_posted':False})
        return Response(CashHandoverRequestSerializer(obj).data)
    @action(detail=True,methods=['post'])
    def reject(self,request,pk=None):
        denied=_deny_unless_feature(request,'approve_cash_handovers')
        if denied:return denied
        with transaction.atomic():
            visible=self.get_object()
            obj=CashHandoverRequest.objects.select_for_update().get(pk=visible.pk)
            if obj.status!='pending':return Response({'detail':'Only pending handovers can be rejected.'},status=400)
            if obj.created_by_id==request.user.id:return Response({'detail':'Maker-checker: the creator cannot reject their own cash handover.'},status=403)
            note=str(request.data.get('decision_note') or '').strip()
            if len(note)<5:return Response({'decision_note':'Rejection reason of at least 5 characters is required.'},status=400)
            obj.status='rejected';obj.decision_note=note;obj.decided_by=request.user;obj.decided_at=timezone.now();obj.save(update_fields=['status','decision_note','decided_by','decided_at','updated_at'])
            AuditLog.objects.create(user=request.user,action='cash_handover_reject',model_name='CashHandoverRequest',object_id=str(obj.pk),details={'branch_id':obj.branch_id,'amount':str(obj.amount)})
        return Response(CashHandoverRequestSerializer(obj).data)
