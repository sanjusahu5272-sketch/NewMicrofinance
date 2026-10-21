from rest_framework import serializers
from django.db.models import Sum
from .models import *



class HolidayCalendarSerializer(serializers.ModelSerializer):
    branch_name=serializers.CharField(source='branch.name',read_only=True,allow_null=True)
    class Meta:
        model=HolidayCalendar; fields='__all__'; read_only_fields=['id','created_by','created_at','updated_at','branch_name']
    def validate_name(self,value):
        value=value.strip()
        if not value: raise serializers.ValidationError('Holiday name is required.')
        return value


class LoanTopUpRequestSerializer(serializers.ModelSerializer):
    member_name=serializers.CharField(source='loan.member.name',read_only=True)
    loan_status=serializers.CharField(source='loan.status',read_only=True)
    class Meta:
        model=LoanTopUpRequest; fields='__all__'
        read_only_fields=['id','status','approval_note','created_by','approved_by','disbursed_by','approved_at','resulting_loan','created_at','updated_at','member_name','loan_status']
    def validate(self,attrs):
        from decimal import Decimal
        loan=attrs.get('loan',getattr(self.instance,'loan',None))
        amount=attrs.get('amount',getattr(self.instance,'amount',Decimal('0')))
        reason=str(attrs.get('reason',getattr(self.instance,'reason','')) or '').strip()
        if amount<=0: raise serializers.ValidationError({'amount':'Top-up amount must be greater than zero.'})
        if loan and (loan.status!='disbursed' or not loan.member.active or not loan.product.active):
            raise serializers.ValidationError({'loan':'Top-up requests require an active member and an active, disbursed loan.'})
        if loan:
            committed=LoanTopUpRequest.objects.filter(loan=loan,status__in=['approved','disbursed']).exclude(pk=getattr(self.instance,'pk',None)).aggregate(total=Sum('amount'))['total'] or Decimal('0.00')
            if amount + committed > loan.principal:
                raise serializers.ValidationError({'amount':'The total of approved/disbursed top-ups cannot exceed the original loan principal.'})
            pending=LoanTopUpRequest.objects.filter(loan=loan,status='pending').exclude(pk=getattr(self.instance,'pk',None)).exists()
            if pending:
                raise serializers.ValidationError({'loan':'This loan already has a pending top-up request.'})
        if len(reason)<5: raise serializers.ValidationError({'reason':'Provide a reason of at least 5 characters.'})
        if self.instance and self.instance.status!='pending':
            raise serializers.ValidationError({'status':'Only pending top-up requests can be edited.'})
        attrs['reason']=reason
        return attrs


class DepositAccountSerializer(serializers.ModelSerializer):
    member_name=serializers.CharField(source='member.name',read_only=True)
    member_no=serializers.CharField(source='member.member_no',read_only=True)
    class Meta:
        model=DepositAccount; fields='__all__'
        read_only_fields=['id','account_no','balance','created_by','created_at','updated_at','member_name','member_no']
    def validate(self,attrs):
        member=attrs.get('member',getattr(self.instance,'member',None))
        if member and not member.active: raise serializers.ValidationError({'member':'Inactive members cannot open deposit accounts.'})
        if member and DepositAccount.objects.filter(member=member).exclude(pk=getattr(self.instance,'pk',None)).exists():
            raise serializers.ValidationError({'member':'This member already has a deposit account in this version; use the existing account.'})
        return attrs


class DepositCollectionSerializer(serializers.ModelSerializer):
    account_no=serializers.CharField(source='account.account_no',read_only=True)
    member_name=serializers.CharField(source='account.member.name',read_only=True)
    class Meta:
        model=DepositCollection; fields='__all__'
        read_only_fields=['id','status','approval_note','journal_reference','created_by','approved_by','approved_at','created_at','updated_at','account_no','member_name']
    def validate(self,attrs):
        from decimal import Decimal
        account=attrs.get('account',getattr(self.instance,'account',None))
        amount=attrs.get('amount',getattr(self.instance,'amount',Decimal('0')))
        method=attrs.get('method',getattr(self.instance,'method','cash'))
        bank=str(attrs.get('bank_account',getattr(self.instance,'bank_account','')) or '').strip()
        if amount<=0: raise serializers.ValidationError({'amount':'Collection amount must be greater than zero.'})
        if account and account.status!='active': raise serializers.ValidationError({'account':'Only active deposit accounts can receive collections.'})
        if method=='bank' and not bank: raise serializers.ValidationError({'bank_account':'Bank account is required for bank collections.'})
        if self.instance and self.instance.status!='pending': raise serializers.ValidationError({'status':'Only pending deposit collections can be edited.'})
        attrs['bank_account']=bank
        return attrs


class BranchSerializer(serializers.ModelSerializer):
    class Meta: model=Branch; fields='__all__'
    def validate_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError('Branch name is required.')
        qs = Branch.objects.filter(name__iexact=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError('A branch with this name already exists.')
        return value
    def validate_code(self, value):
        value = value.strip().upper()
        if not value or len(value) > 30:
            raise serializers.ValidationError('Branch code is required and must be 30 characters or fewer.')
        qs = Branch.objects.filter(code__iexact=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError('A branch with this code already exists.')
        return value
class AreaSerializer(serializers.ModelSerializer):
    class Meta: model=Area; fields='__all__'
class CentreSerializer(serializers.ModelSerializer):
    class Meta: model=Centre; fields='__all__'
class GroupSerializer(serializers.ModelSerializer):
    class Meta: model=Group; fields='__all__'
class EmployeeSerializer(serializers.ModelSerializer):
    class Meta: model=Employee; fields='__all__'
    def validate(self,attrs):
        from decimal import Decimal
        for field in ('aadhaar_status','pan_status'):
            value=attrs.get(field,getattr(self.instance,field,'pending') if self.instance else 'pending')
            if value not in {'pending','verified','rejected'}:
                raise serializers.ValidationError({field:'Choose pending, verified or rejected.'})
        login=attrs.get('login_status',getattr(self.instance,'login_status','inactive') if self.instance else 'inactive')
        if login not in {'inactive','active','locked'}:
            raise serializers.ValidationError({'login_status':'Choose inactive, active or locked.'})
        for field in ('last_experience_years','annual_basic_salary','fixed_allowance','monthly_fixed_deduction','monthly_income_tax'):
            value=attrs.get(field,getattr(self.instance,field,Decimal('0')) if self.instance else Decimal('0'))
            if value < 0:
                raise serializers.ValidationError({field:'Value cannot be negative.'})
        for field in ('sick_leave_days','privilege_leave_days','mandatory_leave_days','casual_leave_days','paternity_leave_days','maternity_leave_days','extraordinary_leave_days'):
            value=attrs.get(field,getattr(self.instance,field,0) if self.instance else 0)
            if value < 0 or value > 365:
                raise serializers.ValidationError({field:'Leave allocation must be between 0 and 365 days.'})
        aadhaar=attrs.get('aadhaar_number',getattr(self.instance,'aadhaar_number','') if self.instance else '')
        if aadhaar and (not aadhaar.isdigit() or len(aadhaar)!=12):
            raise serializers.ValidationError({'aadhaar_number':'Aadhaar number must contain 12 digits.'})
        pan=attrs.get('pan_number',getattr(self.instance,'pan_number','') if self.instance else '')
        if pan and (len(pan)!=10 or not pan[:5].isalpha() or not pan[5:9].isdigit() or not pan[9].isalpha()):
            raise serializers.ValidationError({'pan_number':'Enter PAN in ABCDE1234F format.'})
        return attrs
class MemberSerializer(serializers.ModelSerializer):
    class Meta: model=Member; fields='__all__'
    def validate(self, attrs):
        # Keep member assignments inside the selected branch so a customer
        # cannot silently be attached to another branch's field officer/manager.
        branch = attrs.get('branch', getattr(self.instance, 'branch', None))
        for field in ('field_officer', 'branch_manager'):
            employee = attrs.get(field, getattr(self.instance, field, None) if self.instance else None)
            if employee and branch and employee.branch_id != branch.id:
                raise serializers.ValidationError({field: 'Assigned employee must belong to the same branch as the member.'})
            if employee and field == 'field_officer':
                role = f'{getattr(employee, "role", "")} {getattr(employee, "designation", "")}'.lower()
                if not any(word in role for word in ('field', 'officer', 'collector', 'agent')):
                    raise serializers.ValidationError({field: 'Select an employee designated as a field officer, collector, or agent.'})
            if employee and field == 'branch_manager':
                role = f'{getattr(employee, "role", "")} {getattr(employee, "designation", "")}'.lower()
                if 'manager' not in role:
                    raise serializers.ValidationError({field: 'Select an employee designated as a branch manager.'})
        # The age limit is optional and fail-safe: when enabled, a missing DOB
        # cannot be used to bypass the configured eligibility rule.
        business=BusinessSettings.objects.filter(key='default').first()
        cfg=(business.values or {}) if business else {}
        dob=attrs.get('dob',getattr(self.instance,'dob',None) if self.instance else None)
        if cfg.get('member_age_limit_option'):
            if not dob:
                raise serializers.ValidationError({'dob':'Date of birth is required while member age limits are enabled.'})
            from django.utils import timezone
            today=timezone.localdate()
            age=today.year-dob.year-((today.month,today.day)<(dob.month,dob.day))
            low=int(cfg.get('minimum_member_age',0)); high=int(cfg.get('maximum_member_age',120))
            if age<low or age>high:
                raise serializers.ValidationError({'dob':f'Member age must be between {low} and {high} years under current settings.'})
        return attrs
    def validate_photo_data(self, value):
        if not value:
            return value
        import base64, binascii
        import re
        match = re.fullmatch(r'data:image/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)', value)
        if not match:
            raise serializers.ValidationError('Upload a valid JPG, PNG or WebP image.')
        if len(value) > 2_100_000:
            raise serializers.ValidationError('Passport-size photo must be 1.5 MB or smaller.')
        try:
            raw = base64.b64decode(match.group(2), validate=True)
        except (binascii.Error, ValueError):
            raise serializers.ValidationError('Invalid image encoding.')
        signatures = {'jpeg': raw.startswith(b'\xff\xd8\xff'), 'png': raw.startswith(b'\x89PNG\r\n\x1a\n'), 'webp': len(raw) >= 12 and raw[:4] == b'RIFF' and raw[8:12] == b'WEBP'}
        if not signatures[match.group(1)]:
            raise serializers.ValidationError('Image content does not match its file type.')
        return value
class KycDocumentSerializer(serializers.ModelSerializer):
    file_url=serializers.SerializerMethodField()
    file=serializers.FileField(write_only=True)
    document_type=serializers.CharField(max_length=40)
    class Meta:
        model=KycDocument
        fields=['id','member','document_type','file','file_url','original_name','content_type','size_bytes','verified','verification_note','uploaded_by','created_at']
        read_only_fields=['id','file_url','original_name','content_type','size_bytes','verification_note','uploaded_by','created_at']
    def get_file_url(self,obj):
        # Do not expose public media URLs; downloads must go through authenticated access control.
        return None
    def validate_document_type(self, value):
        import re, unicodedata
        value=(value or '').strip().lower()
        built_in={code for code,_ in KycDocument.DOC_TYPES}
        if value in built_in:
            return value
        # New document types created under Master > Document Type are accepted only when active.
        if MasterCatalogEntry.objects.filter(master_key='document_type',code=value,active=True).exists():
            return value
        # Identity Proof Details in Master > Miscellaneous is also a source for KYC choices.
        # Persist a stable slug rather than an unbounded label; reject ambiguous slugs.
        def slug_name(name):
            text=unicodedata.normalize('NFKD', name).encode('ascii','ignore').decode('ascii').lower()
            return re.sub(r'[^a-z0-9]+','-',text).strip('-')[:40].strip('-')
        matches=[row for row in ReferenceMaster.objects.filter(kind='identity_proof',active=True) if slug_name(row.name)==value]
        if len(matches)==1:
            return value
        if len(matches)>1:
            raise serializers.ValidationError('This Identity Proof name has an ambiguous code. Rename one of the Identity Proof Details entries.')
        raise serializers.ValidationError('Select an active type from Master > Document Type or Master > Miscellaneous > Identity Proof Details.')
    def validate_file(self,uploaded):
        allowed={'application/pdf','image/jpeg','image/png'}
        content_type=getattr(uploaded,'content_type','')
        if uploaded.size > 5 * 1024 * 1024:
            raise serializers.ValidationError('Maximum file size is 5 MB.')
        name=(uploaded.name or '').lower()
        if content_type not in allowed or not name.endswith(('.pdf','.jpg','.jpeg','.png')):
            raise serializers.ValidationError('Only PDF, JPG and PNG files are allowed.')
        # Do not trust browser-supplied MIME type or extension; validate file signature.
        position=uploaded.tell() if hasattr(uploaded,'tell') else 0
        head=uploaded.read(16)
        try: uploaded.seek(position)
        except Exception: pass
        valid=(name.endswith('.pdf') and head.startswith(b'%PDF-')) or \
              (name.endswith(('.jpg','.jpeg')) and head.startswith(b'\xff\xd8\xff')) or \
              (name.endswith('.png') and head.startswith(b'\x89PNG\r\n\x1a\n'))
        if not valid:
            raise serializers.ValidationError('File content does not match its PDF/JPG/PNG extension.')
        return uploaded
    def validate(self,attrs):
        if self.instance is not None:
            immutable={'member','document_type','file'} & set(getattr(self, 'initial_data', {}))
            if immutable:
                raise serializers.ValidationError({key:'Uploaded KYC document ownership/type/file cannot be changed. Upload a new document instead.' for key in sorted(immutable)})
        return attrs
    def create(self,validated_data):
        # A new upload must never be marked verified by the uploader. Verification
        # is a separate authenticated action performed by an authorized reviewer.
        validated_data.pop('verified', None)
        validated_data['verified']=False
        uploaded=validated_data['file']
        validated_data['original_name']=uploaded.name[:255]
        validated_data['content_type']=getattr(uploaded,'content_type','')[:100]
        validated_data['size_bytes']=uploaded.size
        request=self.context.get('request')
        if request and request.user.is_authenticated: validated_data['uploaded_by']=request.user
        return super().create(validated_data)

class LoanProductSerializer(serializers.ModelSerializer):
    class Meta:
        model=LoanProduct
        fields='__all__'

    def validate_name(self, value):
        value=value.strip()
        if not value:
            raise serializers.ValidationError('Loan plan name is required.')
        return value

    def validate_code(self, value):
        value=value.strip().upper()
        qs=LoanProduct.objects.filter(code__iexact=value)
        if self.instance:
            qs=qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError('This loan plan code already exists.')
        if not value:
            raise serializers.ValidationError('Loan plan code is required.')
        return value

    def validate_interest_rate(self, value):
        if value < 0 or value > 1000:
            raise serializers.ValidationError('Annual interest rate must be between 0 and 1000 percent.')
        return value

    def validate_tenure(self, value):
        if value < 1 or value > 1200:
            raise serializers.ValidationError('Installment count must be between 1 and 1200.')
        return value

    def validate(self, attrs):
        for field in ('plan_amount', 'paid_amount', 'file_charge', 'processing_fee_percentage', 'insurance_fee_amount'):
            value = attrs.get(field, getattr(self.instance, field, 0) if self.instance else 0)
            if value is not None and value < 0:
                raise serializers.ValidationError({field: 'This value cannot be negative.'})
        # Paid amount is a display/accounting figure, not an editable product price.
        if 'paid_amount' in attrs and self.instance is not None and attrs['paid_amount'] != self.instance.paid_amount:
            raise serializers.ValidationError({'paid_amount': 'Paid amount is read-only; it must come from recorded payments.'})
        # Once a product has been used by a loan, its pricing/schedule terms must
        # not silently change for future or existing accounts. Deactivate it and
        # create a new version/code for changed terms instead.
        if self.instance and self.instance.loans.exists():
            protected = ('name','code','interest_rate','interest_method','frequency','tenure','processing_fee','late_penalty','grace_days','penalty_scheme','max_income_multiple','plan_amount','recovery_type','holiday_exclude','gst_charge_include','file_charge_include','file_charge','processing_fee_charge_include','processing_fee_percentage','insurance_fee_charge_include','insurance_fee_type','insurance_fee_amount','advance_installment')
            changed = [field for field in protected if field in attrs and attrs[field] != getattr(self.instance, field)]
            if changed:
                raise serializers.ValidationError({field:'This loan plan has linked loans. Create a new plan version instead of changing financial terms.' for field in changed})
        scheme=attrs.get('penalty_scheme',getattr(self.instance,'penalty_scheme',None) if self.instance else None)
        # An inactive scheme must not be assigned to a new plan. Existing issued
        # plans may still be edited for non-financial fields if their bound scheme
        # was later retired; do not silently switch the contractual scheme.
        scheme_is_unchanged=bool(self.instance and scheme and self.instance.penalty_scheme_id==scheme.pk)
        if scheme and not scheme.active and not scheme_is_unchanged:
            raise serializers.ValidationError({'penalty_scheme':'Choose an active Penalty Scheme for a new or changed loan plan.'})
        for field in ('processing_fee','late_penalty'):
            value=attrs.get(field, getattr(self.instance, field, 0) if self.instance else 0)
            if value < 0:
                raise serializers.ValidationError({field:'This amount cannot be negative.'})
        if attrs.get('interest_method', getattr(self.instance,'interest_method','flat')) not in {'flat','reducing'}:
            raise serializers.ValidationError({'interest_method':'Choose Flat or Reducing balance.'})
        if attrs.get('frequency', getattr(self.instance,'frequency','monthly')) not in {'daily','weekly','fortnightly','monthly'}:
            raise serializers.ValidationError({'frequency':'Choose daily, weekly, fortnightly or monthly.'})
        return attrs
class LoanApplicationSerializer(serializers.ModelSerializer):
    class Meta:
        model=LoanApplication
        fields='__all__'
        read_only_fields=('status','created_by','approved_by','approved_amount')

    def validate_requested_amount(self, value):
        if not value.is_finite() or value <= 0:
            raise serializers.ValidationError('Requested amount must be a positive finite amount.')
        return value

    def validate(self, attrs):
        if 'approved_amount' in self.initial_data:
            raise serializers.ValidationError({'approved_amount':'Only the authorized approver may set the approved amount in the approval action.'})
        if self.instance:
            attempted={'status','created_by','approved_by'}.intersection(set(self.initial_data.keys()))
            if attempted:
                raise serializers.ValidationError({field:'Application status and approval identity can only change through the approval/rejection workflow.' for field in sorted(attempted)})
            if self.instance.status != 'pending':
                locked={'member','product','requested_amount','approved_amount','purpose'}.intersection(set(attrs.keys()))
                if locked:
                    raise serializers.ValidationError({field:'An application that has been approved or rejected is immutable; create a new application for changed terms.' for field in sorted(locked)})
        requested=attrs.get('requested_amount',getattr(self.instance,'requested_amount',None))
        approved=attrs.get('approved_amount',getattr(self.instance,'approved_amount',None))
        if approved is not None and (not approved.is_finite() or approved <= 0 or (requested is not None and approved > requested)):
            raise serializers.ValidationError({'approved_amount':'Approved amount must be positive and cannot exceed the requested amount.'})
        return attrs

class LoanSerializer(serializers.ModelSerializer):
    class Meta:
        model=Loan
        fields='__all__'
        read_only_fields=('status','interest_total','total_payable','emi_amount','start_date','disbursed_on','approved_by','disbursed_by','created_by')

    FINANCIAL_FIELDS={'member','product','application','principal','interest_total','total_payable','emi_amount','start_date','disbursed_on','status','approved_by','disbursed_by','created_by'}

    def validate(self, attrs):
        if self.instance:
            attempted=self.FINANCIAL_FIELDS.intersection(set(self.initial_data.keys()))
            if attempted:
                raise serializers.ValidationError({field:'Loan financial/state fields cannot be edited directly. Use the approved loan workflow.' for field in sorted(attempted)})
        elif attrs.get('status') in {'approved','disbursed','closed','rejected','restructured'}:
            raise serializers.ValidationError({'status':'Loan state must be changed only through the approved workflow.'})
        principal=attrs.get('principal')
        if principal is not None and (not principal.is_finite() or principal <= 0):
            raise serializers.ValidationError({'principal':'Loan principal must be a positive finite amount.'})
        return attrs

class InstallmentSerializer(serializers.ModelSerializer):
    class Meta: model=Installment; fields='__all__'
class DisbursementSerializer(serializers.ModelSerializer):
    class Meta: model=Disbursement; fields='__all__'
class PaymentSerializer(serializers.ModelSerializer):
    method=serializers.CharField(max_length=40)
    class Meta:
        model=Payment
        fields='__all__'
        read_only_fields=['receipt_no','approval_note','approved_by','approved_at','created_by']

    def validate_method(self,value):
        value=(value or '').strip().lower()
        built_in={'cash','upi','bank','card','gateway'}
        if value in built_in:
            return value
        if MasterCatalogEntry.objects.filter(master_key='collection_mode',code=value,active=True,ledger_account__in=['Cash','Bank','UPI Clearing','Card Clearing','Gateway Clearing']).exists():
            return value
        raise serializers.ValidationError('Choose a built-in or active Collection Mode master with a ledger account mapping.')

    def validate_amount(self,value):
        if value <= 0:
            raise serializers.ValidationError('Amount must be greater than zero.')
        return value

    def validate_status(self,value):
        if value not in {'success','pending','failed','refunded'}:
            raise serializers.ValidationError('Choose Success (immediate post), Pending Approval, Failed, or Refunded.')
        return value

    def validate(self,attrs):
        attrs=super().validate(attrs)
        method=attrs.get('method',getattr(self.instance,'method',None))
        bank_account=str(attrs.get('bank_account',getattr(self.instance,'bank_account','')) or '').strip()
        if method=='bank' and len(bank_account)>120:
            raise serializers.ValidationError({'bank_account':'Bank account name must be 120 characters or fewer.'})
        member=attrs.get('member',getattr(self.instance,'member',None))
        loan=attrs.get('loan',getattr(self.instance,'loan',None))
        payment_status=attrs.get('status',getattr(self.instance,'status','success'))
        if loan and member and loan.member_id!=member.pk:
            raise serializers.ValidationError({'loan':'Selected loan does not belong to this customer.'})
        if payment_status=='pending' and not loan:
            raise serializers.ValidationError({'loan':'A pending collection approval must be linked to a specific loan.'})
        return attrs

class ProductLoanRequestSerializer(serializers.ModelSerializer):
    member_name=serializers.CharField(source='member.name',read_only=True)
    member_no=serializers.CharField(source='member.member_no',read_only=True)
    class Meta:
        model=ProductLoanRequest
        fields='__all__'
        read_only_fields=['id','financed_amount','status','approval_note','created_by','approved_by','approved_at','created_at','updated_at','member_name','member_no']
    def validate(self,attrs):
        from decimal import Decimal
        product_name=str(attrs.get('product_name',getattr(self.instance,'product_name','')) or '').strip()
        quantity=attrs.get('quantity',getattr(self.instance,'quantity',1))
        unit_price=attrs.get('unit_price',getattr(self.instance,'unit_price',Decimal('0')))
        down_payment=attrs.get('down_payment',getattr(self.instance,'down_payment',Decimal('0')))
        tenure=attrs.get('tenure_installments',getattr(self.instance,'tenure_installments',12))
        if not product_name:
            raise serializers.ValidationError({'product_name':'Product name is required.'})
        if quantity < 1 or quantity > 10000:
            raise serializers.ValidationError({'quantity':'Quantity must be between 1 and 10,000.'})
        if unit_price <= 0:
            raise serializers.ValidationError({'unit_price':'Unit price must be greater than zero.'})
        if down_payment < 0 or down_payment >= unit_price*quantity:
            raise serializers.ValidationError({'down_payment':'Down payment must be non-negative and less than the total product price for a financed request.'})
        if tenure < 1 or tenure > 1200:
            raise serializers.ValidationError({'tenure_installments':'Installments must be between 1 and 1,200.'})
        attrs['product_name']=product_name
        attrs['financed_amount']=(unit_price*quantity-down_payment).quantize(Decimal('0.01'))
        if self.instance and self.instance.status!='pending':
            protected={'member','product_name','quantity','unit_price','down_payment','tenure_installments'} & set(attrs)
            if protected:
                raise serializers.ValidationError({'status':'Only pending product-loan requests can be edited.'})
        return attrs


class FundsTransferRequestSerializer(serializers.ModelSerializer):
    class Meta:
        model=FundsTransferRequest
        fields='__all__'
        read_only_fields=['id','status','approval_note','created_by','approved_by','approved_at','created_at','updated_at']
    def validate(self,attrs):
        from decimal import Decimal
        from_account=str(attrs.get('from_account',getattr(self.instance,'from_account','')) or '').strip()
        to_account=str(attrs.get('to_account',getattr(self.instance,'to_account','')) or '').strip()
        amount=attrs.get('amount',getattr(self.instance,'amount',Decimal('0')))
        reference=str(attrs.get('reference',getattr(self.instance,'reference','')) or '').strip()
        if not from_account or not to_account:
            raise serializers.ValidationError({'from_account':'Source and destination ledger accounts are required.'})
        from_branch=attrs.get('from_branch',getattr(self.instance,'from_branch',None))
        to_branch=attrs.get('to_branch',getattr(self.instance,'to_branch',None))
        if from_account.casefold()==to_account.casefold() and ((from_branch.pk if from_branch else None)==(to_branch.pk if to_branch else None)):
            raise serializers.ValidationError({'to_account':'Source and destination accounts must differ unless this is a transfer between different branches.'})
        def transferable(account_name):
            configured=ChartOfAccount.objects.filter(name__iexact=account_name).first()
            if configured:
                return configured.active and configured.account_type=='asset'
            normal=account_name.casefold()
            return normal in {'cash','bank','upi clearing','card clearing','gateway clearing'} or normal.startswith('bank:')
        for field,account_name in (('from_account',from_account),('to_account',to_account)):
            if not transferable(account_name):
                raise serializers.ValidationError({field:'Fund transfers are limited to active asset accounts (Cash/Bank/clearing) configured in Chart of Accounts. Configure custom asset accounts first.'})
        if not amount.is_finite() or amount<=0:
            raise serializers.ValidationError({'amount':'Transfer amount must be a positive finite amount.'})
        if (from_branch is not None and not from_branch.active) or (to_branch is not None and not to_branch.active):
            raise serializers.ValidationError({'from_branch':'Any selected transfer branch must be active.'})
        if reference and FundsTransferRequest.objects.filter(reference__iexact=reference).exclude(pk=getattr(self.instance,'pk',None)).exists():
            raise serializers.ValidationError({'reference':'This transfer reference is already used.'})
        if self.instance:
            if self.instance.status!='pending':
                raise serializers.ValidationError({'status':'Only pending transfer requests can be edited.'})
            for field, current in (('from_branch', self.instance.from_branch_id), ('to_branch', self.instance.to_branch_id)):
                if field in self.initial_data:
                    raw=self.initial_data.get(field)
                    try: submitted=int(raw) if raw not in (None,'') else None
                    except (TypeError,ValueError): submitted='invalid'
                    if submitted != current:
                        raise serializers.ValidationError({field:'Branch routing cannot be changed after a transfer request is created; cancel and create a new request.'})
        attrs['from_account']=from_account; attrs['to_account']=to_account; attrs['reference']=reference
        return attrs


class OverdueTransferRequestSerializer(serializers.ModelSerializer):
    member_name=serializers.CharField(source='loan.member.name',read_only=True)
    member_no=serializers.CharField(source='loan.member.member_no',read_only=True)
    source_branch_name=serializers.CharField(source='from_branch.name',read_only=True)
    target_branch_name=serializers.CharField(source='to_branch.name',read_only=True)
    source_employee_name=serializers.CharField(source='from_employee.name',read_only=True)
    target_employee_name=serializers.CharField(source='to_employee.name',read_only=True)
    loan_id=serializers.IntegerField(source='loan.id',read_only=True)
    class Meta:
        model=OverdueTransferRequest
        fields='__all__'
        read_only_fields=['id','from_branch','from_employee','overdue_amount_snapshot','overdue_installments_snapshot','status','created_by','decided_by','decision_note','decided_at','created_at','updated_at']
    def validate_reason(self,value):
        value=(value or '').strip()
        if len(value)<5:
            raise serializers.ValidationError('Transfer reason must be at least 5 characters.')
        if len(value)>2000:
            raise serializers.ValidationError('Transfer reason cannot exceed 2,000 characters.')
        return value
    def validate_idempotency_key(self,value):
        value=(value or '').strip()
        if not value or len(value)>100:
            raise serializers.ValidationError('A unique idempotency key of 1–100 characters is required.')
        return value


class CapitalEntrySerializer(serializers.ModelSerializer):
    class Meta: model=CapitalEntry; fields='__all__'; read_only_fields=['created_by']
    def validate_amount(self,value):
        if not value.is_finite() or value <= 0:
            raise serializers.ValidationError('Capital amount must be a positive finite value.')
        return value
class ExpenseSerializer(serializers.ModelSerializer):
    class Meta: model=Expense; fields='__all__'
class JournalEntrySerializer(serializers.ModelSerializer):
    account_ref_code=serializers.CharField(source='account_ref.code',read_only=True,default='')
    account_ref_name=serializers.CharField(source='account_ref.name',read_only=True,default='')
    class Meta: model=JournalEntry; fields='__all__'
    def validate(self,attrs):
        debit=attrs.get('debit',getattr(self.instance,'debit',0))
        credit=attrs.get('credit',getattr(self.instance,'credit',0))
        if debit < 0 or credit < 0:
            raise serializers.ValidationError('Debit and credit cannot be negative.')
        if debit and credit:
            raise serializers.ValidationError('Use either debit or credit on one journal line, not both.')
        if not debit and not credit:
            raise serializers.ValidationError('A journal line must contain a debit or credit amount.')
        return attrs
class AuditLogSerializer(serializers.ModelSerializer):
    class Meta: model=AuditLog; fields='__all__'


class IntegrationSettingSerializer(serializers.ModelSerializer):
    value=serializers.CharField(write_only=True,required=False,allow_blank=True)
    masked_value=serializers.SerializerMethodField(read_only=True)
    class Meta:
        model=IntegrationSetting
        fields=['id','provider','key','enabled','masked_value','value','updated_at']
        read_only_fields=['id','masked_value','updated_at']
    def get_masked_value(self,obj):
        try:
            raw=obj.get_value()
            if not raw: return ''
            return raw[:4] + ('*' * max(4,min(12,len(raw)-4)))
        except Exception:
            return '********' if obj.encrypted_value else ''


class ChartOfAccountSerializer(serializers.ModelSerializer):
    class Meta:
        model=ChartOfAccount
        fields='__all__'
    def validate_code(self,value):
        value=value.strip().upper()
        qs=ChartOfAccount.objects.filter(code__iexact=value)
        if self.instance: qs=qs.exclude(pk=self.instance.pk)
        if not value or qs.exists(): raise serializers.ValidationError('Account code must be unique and non-empty.')
        return value
    def validate_name(self,value):
        value=value.strip()
        qs=ChartOfAccount.objects.filter(name__iexact=value)
        if self.instance: qs=qs.exclude(pk=self.instance.pk)
        if not value or qs.exists(): raise serializers.ValidationError('Account name must be unique and non-empty.')
        return value


class BankStatementImportBatchSerializer(serializers.ModelSerializer):
    created_by_name=serializers.CharField(source='created_by.username',read_only=True)
    reconciled_by_name=serializers.CharField(source='reconciled_by.username',read_only=True)
    unmatched_count=serializers.SerializerMethodField()
    matched_count=serializers.SerializerMethodField()
    ignored_count=serializers.SerializerMethodField()
    class Meta:
        model=BankStatementImportBatch
        fields='__all__'
        read_only_fields=['file_sha256','created_by','reconciled_by','reconciled_at','status','row_count','total_debit','total_credit','statement_start','statement_end']
    def get_unmatched_count(self,obj): return obj.lines.filter(status='unmatched').count()
    def get_matched_count(self,obj): return obj.lines.filter(status='matched').count()
    def get_ignored_count(self,obj): return obj.lines.filter(status='ignored').count()


class BankReconciliationLineSerializer(serializers.ModelSerializer):
    class Meta:
        model=BankReconciliationLine
        fields='__all__'
        read_only_fields=['created_by','status','matched_journal_reference','batch']
    def validate(self,attrs):
        debit=attrs.get('debit',getattr(self.instance,'debit',0)); credit=attrs.get('credit',getattr(self.instance,'credit',0))
        if debit < 0 or credit < 0 or (debit and credit):
            raise serializers.ValidationError('Debit and credit must be non-negative; enter an amount on only one side.')
        if debit == 0 and credit == 0:
            raise serializers.ValidationError('A statement line must have a debit or credit amount.')
        return attrs


class StaffUserSerializer(serializers.Serializer):
    id=serializers.IntegerField(read_only=True)
    username=serializers.CharField(max_length=150)
    email=serializers.EmailField(required=False,allow_blank=True)
    first_name=serializers.CharField(required=False,allow_blank=True)
    last_name=serializers.CharField(required=False,allow_blank=True)
    password=serializers.CharField(write_only=True,min_length=12,required=False,trim_whitespace=False)
    role=serializers.ChoiceField(choices=StaffProfile.ROLE_CHOICES)
    custom_role=serializers.PrimaryKeyRelatedField(queryset=CustomRole.objects.filter(active=True),required=False,allow_null=True)
    branch=serializers.IntegerField(required=False,allow_null=True)
    permissions=serializers.DictField(required=False)
    active=serializers.BooleanField(required=False,default=True)
    is_active=serializers.BooleanField(read_only=True)

    def validate_role(self,value):
        request=self.context.get('request')
        if value == 'admin' and not (request and request.user.is_superuser):
            raise serializers.ValidationError('Only a superuser may assign the administrator role.')
        return value

    CORE_PERMISSION_KEYS={
        'view_dashboard','view_customers','manage_customers','delete_customers',
        'view_kyc','upload_kyc','verify_kyc','view_loans','create_loan_applications',
        'update_loan_applications','delete_loan_applications','approve_loans','disburse_loans',
        'view_collections','collect_payments','approve_collections','view_penalties','manage_penalties',
        'view_ptp','manage_ptp','view_settlements','manage_settlements','approve_settlements',
        'view_masters','manage_masters','view_branches','manage_branches','view_reports','export_reports',
        'view_accounting','manage_accounting','approve_vouchers','view_fund_transfers',
        'create_fund_transfers','approve_fund_transfers','view_overdue_transfers','manage_overdue_transfers','approve_overdue_transfers','manage_financial_locks','approve_financial_locks','manage_payment_reversals','approve_payment_reversals','view_hr','manage_hr','approve_salary','view_household_assessments','manage_household_assessments','verify_household_assessments','view_customer_complaints','manage_customer_complaints','resolve_customer_complaints','view_field_visits','manage_field_visits','view_cash_handovers','manage_cash_handovers','approve_cash_handovers',
        'view_products','manage_products','manage_staff','manage_permissions','view_settings',
        'manage_settings','manage_company_settings','test_sms','view_audit_logs','view_approvals'
    }
    GRANULAR_PERMISSION_KEYS={'perm_loanplan_view','perm_loanplan_create','perm_loanplan_edit','perm_loanplan_delete','perm_loanplan_export','perm_penaltyscheme_view','perm_penaltyscheme_create','perm_penaltyscheme_edit','perm_penaltyscheme_delete','perm_penaltyscheme_export','perm_branches_view','perm_branches_create','perm_branches_edit','perm_branches_delete','perm_branches_export','perm_staffbranches_view','perm_staffbranches_create','perm_staffbranches_edit','perm_staffbranches_delete','perm_staffbranches_export','perm_branchcenter_view','perm_branchcenter_create','perm_branchcenter_edit','perm_branchcenter_delete','perm_branchcenter_export','perm_groups_view','perm_groups_create','perm_groups_edit','perm_groups_delete','perm_groups_export','perm_branchlogin_view','perm_branchlogin_create','perm_branchlogin_edit','perm_branchlogin_delete','perm_branchlogin_export','perm_addstaff_view','perm_addstaff_create','perm_addstaff_edit','perm_addstaff_delete','perm_addstaff_export','perm_loanpurpose_view','perm_loanpurpose_create','perm_loanpurpose_edit','perm_loanpurpose_delete','perm_loanpurpose_export','perm_state_view','perm_state_create','perm_state_edit','perm_state_delete','perm_state_export','perm_bank_view','perm_bank_create','perm_bank_edit','perm_bank_delete','perm_bank_export','perm_leave_view','perm_leave_create','perm_leave_edit','perm_leave_delete','perm_leave_export','perm_designation_view','perm_designation_create','perm_designation_edit','perm_designation_delete','perm_designation_export','perm_relationship_view','perm_relationship_create','perm_relationship_edit','perm_relationship_delete','perm_relationship_export','perm_documenttype_view','perm_documenttype_create','perm_documenttype_edit','perm_documenttype_delete','perm_documenttype_export','perm_collectionmode_view','perm_collectionmode_create','perm_collectionmode_edit','perm_collectionmode_delete','perm_collectionmode_export','perm_miscellaneous_view','perm_miscellaneous_create','perm_miscellaneous_edit','perm_miscellaneous_delete','perm_miscellaneous_export','perm_softwaretiming_view','perm_softwaretiming_create','perm_softwaretiming_edit','perm_softwaretiming_delete','perm_softwaretiming_export','perm_sessionmaster_view','perm_sessionmaster_create','perm_sessionmaster_edit','perm_sessionmaster_delete','perm_sessionmaster_export','perm_setting_view','perm_setting_create','perm_setting_edit','perm_setting_delete','perm_setting_export','perm_companyprofile_view','perm_companyprofile_create','perm_companyprofile_edit','perm_companyprofile_delete','perm_companyprofile_export','perm_adminpanel_view','perm_adminpanel_create','perm_adminpanel_edit','perm_adminpanel_delete','perm_adminpanel_export','perm_smstesting_view','perm_smstesting_create','perm_smstesting_edit','perm_smstesting_delete','perm_smstesting_export','perm_series_view','perm_series_create','perm_series_edit','perm_series_delete','perm_series_export','perm_productcategory_view','perm_productcategory_create','perm_productcategory_edit','perm_productcategory_delete','perm_productcategory_export','perm_productbrand_view','perm_productbrand_create','perm_productbrand_edit','perm_productbrand_delete','perm_productbrand_export','perm_productvariant_view','perm_productvariant_create','perm_productvariant_edit','perm_productvariant_delete','perm_productvariant_export','perm_productsupplier_view','perm_productsupplier_create','perm_productsupplier_edit','perm_productsupplier_delete','perm_productsupplier_export','perm_insuranceparty_view','perm_insuranceparty_create','perm_insuranceparty_edit','perm_insuranceparty_delete','perm_insuranceparty_export','perm_productitem_view','perm_productitem_create','perm_productitem_edit','perm_productitem_delete','perm_productitem_export','perm_productloan_view','perm_productloan_create','perm_productloan_edit','perm_productloan_delete','perm_productloan_export','perm_employee_view','perm_employee_create','perm_employee_edit','perm_employee_delete','perm_employee_export','perm_salary_view','perm_salary_create','perm_salary_edit','perm_salary_delete','perm_salary_export','perm_holiday_view','perm_holiday_create','perm_holiday_edit','perm_holiday_delete','perm_holiday_export','perm_employeeloantransfer_view','perm_employeeloantransfer_create','perm_employeeloantransfer_edit','perm_employeeloantransfer_delete','perm_employeeloantransfer_export','perm_singleloantransfer_view','perm_singleloantransfer_create','perm_singleloantransfer_edit','perm_singleloantransfer_delete','perm_singleloantransfer_export','perm_membertransfer_view','perm_membertransfer_create','perm_membertransfer_edit','perm_membertransfer_delete','perm_membertransfer_export','perm_updatecenterleader_view','perm_updatecenterleader_create','perm_updatecenterleader_edit','perm_updatecenterleader_delete','perm_updatecenterleader_export','perm_printletter_view','perm_printletter_create','perm_printletter_edit','perm_printletter_delete','perm_printletter_export','perm_employeeleave_view','perm_employeeleave_create','perm_employeeleave_edit','perm_employeeleave_delete','perm_employeeleave_export','perm_attendance_view','perm_attendance_create','perm_attendance_edit','perm_attendance_delete','perm_attendance_export','perm_customer_view','perm_customer_create','perm_customer_edit','perm_customer_delete','perm_customer_export','perm_customercgt_view','perm_customercgt_create','perm_customercgt_edit','perm_customercgt_delete','perm_customercgt_export','perm_customergroup_view','perm_customergroup_create','perm_customergroup_edit','perm_customergroup_delete','perm_customergroup_export','perm_kycdocuments_view','perm_kycdocuments_create','perm_kycdocuments_edit','perm_kycdocuments_delete','perm_kycdocuments_export','perm_downloadloanform_view','perm_downloadloanform_create','perm_downloadloanform_edit','perm_downloadloanform_delete','perm_downloadloanform_export','perm_loantopup_view','perm_loantopup_create','perm_loantopup_edit','perm_loantopup_delete','perm_loantopup_export','perm_individualloan_view','perm_individualloan_create','perm_individualloan_edit','perm_individualloan_delete','perm_individualloan_export','perm_grouploan_view','perm_grouploan_create','perm_grouploan_edit','perm_grouploan_delete','perm_grouploan_export','perm_disbursement_view','perm_disbursement_create','perm_disbursement_edit','perm_disbursement_delete','perm_disbursement_export','perm_groupdisbursement_view','perm_groupdisbursement_create','perm_groupdisbursement_edit','perm_groupdisbursement_delete','perm_groupdisbursement_export','perm_loansummary_view','perm_loansummary_create','perm_loansummary_edit','perm_loansummary_delete','perm_loansummary_export','perm_advancesecurity_view','perm_advancesecurity_create','perm_advancesecurity_edit','perm_advancesecurity_delete','perm_advancesecurity_export','perm_paidemis_view','perm_paidemis_create','perm_paidemis_edit','perm_paidemis_delete','perm_paidemis_export','perm_dueemis_view','perm_dueemis_create','perm_dueemis_edit','perm_dueemis_delete','perm_dueemis_export','perm_duepenalty_view','perm_duepenalty_create','perm_duepenalty_edit','perm_duepenalty_delete','perm_duepenalty_export','perm_futuredueemis_view','perm_futuredueemis_create','perm_futuredueemis_edit','perm_futuredueemis_delete','perm_futuredueemis_export','perm_promisetopay_view','perm_promisetopay_create','perm_promisetopay_edit','perm_promisetopay_delete','perm_promisetopay_export','perm_groupemicollection_view','perm_groupemicollection_create','perm_groupemicollection_edit','perm_groupemicollection_delete','perm_groupemicollection_export','perm_oldmembercollection_view','perm_oldmembercollection_create','perm_oldmembercollection_edit','perm_oldmembercollection_delete','perm_oldmembercollection_export','perm_newmembercollection_view','perm_newmembercollection_create','perm_newmembercollection_edit','perm_newmembercollection_delete','perm_newmembercollection_export','perm_approveloan_view','perm_approveloan_create','perm_approveloan_edit','perm_approveloan_delete','perm_approveloan_export','perm_approvesalary_view','perm_approvesalary_create','perm_approvesalary_edit','perm_approvesalary_delete','perm_approvesalary_export','perm_approvecollection_view','perm_approvecollection_create','perm_approvecollection_edit','perm_approvecollection_delete','perm_approvecollection_export','perm_approveproductloan_view','perm_approveproductloan_create','perm_approveproductloan_edit','perm_approveproductloan_delete','perm_approveproductloan_export','perm_approvesettlement_view','perm_approvesettlement_create','perm_approvesettlement_edit','perm_approvesettlement_delete','perm_approvesettlement_export','perm_approvefundtransfer_view','perm_approvefundtransfer_create','perm_approvefundtransfer_edit','perm_approvefundtransfer_delete','perm_approvefundtransfer_export','perm_loansettlement_view','perm_loansettlement_create','perm_loansettlement_edit','perm_loansettlement_delete','perm_loansettlement_export','perm_deathmember_view','perm_deathmember_create','perm_deathmember_edit','perm_deathmember_delete','perm_deathmember_export','perm_cibilformat_view','perm_cibilformat_create','perm_cibilformat_edit','perm_cibilformat_delete','perm_cibilformat_export','perm_areasurvey_view','perm_areasurvey_create','perm_areasurvey_edit','perm_areasurvey_delete','perm_areasurvey_export','perm_logrecords_view','perm_logrecords_create','perm_logrecords_edit','perm_logrecords_delete','perm_logrecords_export','perm_loanhistory_view','perm_loanhistory_create','perm_loanhistory_edit','perm_loanhistory_delete','perm_loanhistory_export','perm_daybook_view','perm_daybook_create','perm_daybook_edit','perm_daybook_delete','perm_daybook_export','perm_cashbook_view','perm_cashbook_create','perm_cashbook_edit','perm_cashbook_delete','perm_cashbook_export','perm_voucherentries_view','perm_voucherentries_create','perm_voucherentries_edit','perm_voucherentries_delete','perm_voucherentries_export','perm_paymentvoucher_view','perm_paymentvoucher_create','perm_paymentvoucher_edit','perm_paymentvoucher_delete','perm_paymentvoucher_export','perm_receiptvoucher_view','perm_receiptvoucher_create','perm_receiptvoucher_edit','perm_receiptvoucher_delete','perm_receiptvoucher_export','perm_contravoucher_view','perm_contravoucher_create','perm_contravoucher_edit','perm_contravoucher_delete','perm_contravoucher_export','perm_journalvoucher_view','perm_journalvoucher_create','perm_journalvoucher_edit','perm_journalvoucher_delete','perm_journalvoucher_export','perm_trialbalance_view','perm_trialbalance_create','perm_trialbalance_edit','perm_trialbalance_delete','perm_trialbalance_export','perm_fytrialbalance_view','perm_fytrialbalance_create','perm_fytrialbalance_edit','perm_fytrialbalance_delete','perm_fytrialbalance_export','perm_fyvoucherstatement_view','perm_fyvoucherstatement_create','perm_fyvoucherstatement_edit','perm_fyvoucherstatement_delete','perm_fyvoucherstatement_export','perm_fyopeningbalance_view','perm_fyopeningbalance_create','perm_fyopeningbalance_edit','perm_fyopeningbalance_delete','perm_fyopeningbalance_export','perm_fundtransfer_view','perm_fundtransfer_create','perm_fundtransfer_edit','perm_fundtransfer_delete','perm_fundtransfer_export','perm_acgroup_view','perm_acgroup_create','perm_acgroup_edit','perm_acgroup_delete','perm_acgroup_export','perm_profitloss_view','perm_profitloss_create','perm_profitloss_edit','perm_profitloss_delete','perm_profitloss_export','perm_overview_view','perm_overview_create','perm_overview_edit','perm_overview_delete','perm_overview_export','perm_ledger_view','perm_ledger_create','perm_ledger_edit','perm_ledger_delete','perm_ledger_export','perm_branchledger_view','perm_branchledger_create','perm_branchledger_edit','perm_branchledger_delete'}
    ALLOWED_PERMISSION_KEYS=CORE_PERMISSION_KEYS | GRANULAR_PERMISSION_KEYS
    def validate_permissions(self,value):
        unknown=set(value)-self.ALLOWED_PERMISSION_KEYS
        if unknown: raise serializers.ValidationError('Unknown permission keys: '+', '.join(sorted(unknown)))
        if any(not isinstance(v,bool) for v in value.values()):
            raise serializers.ValidationError('Permission values must be true or false.')
        return value

    def create(self,validated_data):
        from django.contrib.auth import get_user_model
        from django.db import transaction
        User=get_user_model(); request=self.context['request']
        password=validated_data.pop('password',None)
        if not password:
            raise serializers.ValidationError({'password':'A password of at least 12 characters is required when creating a staff account.'})
        branch_id=validated_data.pop('branch',None)
        role=validated_data.pop('role'); permissions=validated_data.pop('permissions',{}); custom_role=validated_data.pop('custom_role',None)
        active=validated_data.pop('active',True)
        if User.objects.filter(username=validated_data['username']).exists():
            raise serializers.ValidationError({'username':'Username already exists.'})
        branch=None
        if branch_id is not None:
            branch=Branch.objects.filter(pk=branch_id,active=True).first()
            if not branch: raise serializers.ValidationError({'branch':'Selected active branch was not found.'})
        with transaction.atomic():
            user=User.objects.create_user(password=password,is_active=active,**validated_data)
            StaffProfile.objects.create(user=user,role=role,custom_role=custom_role,branch=branch,permissions=permissions,active=active,created_by=request.user)
        return user

    def update(self,instance,validated_data):
        request=self.context.get('request')
        if instance.is_superuser and request and request.user.pk == instance.pk and validated_data.get('active') is False:
            raise serializers.ValidationError({'active':'A superuser cannot disable their own account.'})
        profile, _=StaffProfile.objects.get_or_create(user=instance,defaults={'created_by':self.context['request'].user})
        if 'password' in validated_data: instance.set_password(validated_data.pop('password'))
        for key in ('email','first_name','last_name'):
            if key in validated_data: setattr(instance,key,validated_data[key])
        if 'active' in validated_data:
            instance.is_active=validated_data['active']; profile.active=validated_data['active']
        if 'role' in validated_data: profile.role=validated_data['role']
        if 'custom_role' in validated_data: profile.custom_role=validated_data['custom_role']
        if 'branch' in validated_data:
            branch_id=validated_data['branch']
            profile.branch=Branch.objects.filter(pk=branch_id,active=True).first() if branch_id else None
            if branch_id and not profile.branch: raise serializers.ValidationError({'branch':'Selected active branch was not found.'})
        if 'permissions' in validated_data: profile.permissions=validated_data['permissions']
        instance.save(); profile.save()
        return instance

    def to_representation(self,instance):
        profile=getattr(instance,'staff_profile',None)
        return {'id':instance.pk,'username':instance.username,'email':instance.email,'first_name':instance.first_name,'last_name':instance.last_name,'is_active':instance.is_active,'role':profile.role if profile else ('admin' if instance.is_superuser else 'loan_officer'),'branch':profile.branch_id if profile else None,'custom_role':profile.custom_role_id if profile else None,'permissions':profile.permissions if profile else {}}


class CustomRoleSerializer(serializers.ModelSerializer):
    class Meta:
        model=CustomRole
        fields=['id','name','code','description','permissions','active','is_system','created_at','updated_at']
        read_only_fields=['id','is_system','created_at','updated_at']

    def validate_name(self,value):
        value=value.strip()
        qs=CustomRole.objects.filter(name__iexact=value)
        if self.instance: qs=qs.exclude(pk=self.instance.pk)
        if not value or qs.exists():
            raise serializers.ValidationError('Role name must be unique and non-empty.')
        return value

    def validate_code(self,value):
        value=value.strip().lower().replace(' ','-')
        qs=CustomRole.objects.filter(code__iexact=value)
        if self.instance: qs=qs.exclude(pk=self.instance.pk)
        if not value or qs.exists():
            raise serializers.ValidationError('Role code must be unique and non-empty.')
        return value

    def validate_permissions(self,value):
        allowed=StaffUserSerializer.ALLOWED_PERMISSION_KEYS
        unknown=set(value)-allowed
        if unknown:
            raise serializers.ValidationError('Unknown permission keys: '+', '.join(sorted(unknown)))
        if any(not isinstance(v,bool) for v in value.values()):
            raise serializers.ValidationError('Permission values must be true or false.')
        return value

    def validate(self,attrs):
        if self.instance and self.instance.is_system and attrs.get('active') is False:
            raise serializers.ValidationError({'active':'System roles cannot be deactivated.'})
        return attrs


class OrganizationProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model=OrganizationProfile
        fields='__all__'
        read_only_fields=['id','created_at','updated_at']
    def validate_logo_data(self,value):
        if not value: return value
        import re
        if len(value)>2_000_000:
            raise serializers.ValidationError('Logo is too large; use an image under about 1.5 MB.')
        if not re.match(r'^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$',value):
            raise serializers.ValidationError('Use a PNG, JPEG or WebP image logo.')
        return value

class AttendanceRecordSerializer(serializers.ModelSerializer):
    class Meta:
        model=AttendanceRecord
        fields='__all__'
        read_only_fields=['id','created_at','updated_at','created_by']
    def validate(self,attrs):
        employee=attrs.get('employee',getattr(self.instance,'employee',None))
        day=attrs.get('attendance_date',getattr(self.instance,'attendance_date',None))
        if employee and day:
            qs=AttendanceRecord.objects.filter(employee=employee,attendance_date=day)
            if self.instance: qs=qs.exclude(pk=self.instance.pk)
            if qs.exists(): raise serializers.ValidationError({'attendance_date':'Attendance already exists for this employee on this date.'})
        ci=attrs.get('check_in',getattr(self.instance,'check_in',None)); co=attrs.get('check_out',getattr(self.instance,'check_out',None))
        if ci and co and co<ci: raise serializers.ValidationError({'check_out':'Check-out cannot be earlier than check-in.'})
        return attrs

class PayrollRecordSerializer(serializers.ModelSerializer):
    employee_name=serializers.CharField(source='employee.name',read_only=True)
    class Meta:
        model=PayrollRecord
        fields='__all__'
        read_only_fields=['id','created_at','updated_at','created_by','net_salary','status','approval_note','approved_by','approved_at']
    def validate(self,attrs):
        from decimal import Decimal
        status=attrs.get('status',getattr(self.instance,'status','draft') if self.instance else 'draft')
        if status=='paid':
            raise serializers.ValidationError({'status':'Payroll cannot be marked paid until an audited salary disbursement workflow is enabled.'})
        employee=attrs.get('employee',getattr(self.instance,'employee',None))
        month=attrs.get('period_month',getattr(self.instance,'period_month',None))
        if month and month.day!=1: raise serializers.ValidationError({'period_month':'Select the first day of the payroll month, e.g. 2026-10-01.'})
        qs=PayrollRecord.objects.filter(employee=employee,period_month=month) if employee and month else PayrollRecord.objects.none()
        if self.instance: qs=qs.exclude(pk=self.instance.pk)
        if qs.exists(): raise serializers.ValidationError({'period_month':'Payroll already exists for this employee and month.'})
        for f in ('basic_salary','fixed_allowance','fixed_deduction','income_tax'):
            value=attrs.get(f,getattr(self.instance,f,Decimal('0')) if self.instance else Decimal('0'))
            if value<0: raise serializers.ValidationError({f:'Amount cannot be negative.'})
        basic=attrs.get('basic_salary',getattr(self.instance,'basic_salary',Decimal('0')) if self.instance else Decimal('0'))
        allowance=attrs.get('fixed_allowance',getattr(self.instance,'fixed_allowance',Decimal('0')) if self.instance else Decimal('0'))
        deduction=attrs.get('fixed_deduction',getattr(self.instance,'fixed_deduction',Decimal('0')) if self.instance else Decimal('0'))
        tax=attrs.get('income_tax',getattr(self.instance,'income_tax',Decimal('0')) if self.instance else Decimal('0'))
        net=basic+allowance-deduction-tax
        if net<0: raise serializers.ValidationError({'fixed_deduction':'Deductions cannot exceed gross salary.'})
        attrs['net_salary']=net
        return attrs


class ReferenceMasterSerializer(serializers.ModelSerializer):
    class Meta:
        model=ReferenceMaster
        fields=['id','kind','name','active','created_at','updated_at']
        read_only_fields=['id','created_at','updated_at']
    def validate_name(self,value):
        import re, unicodedata
        value=value.strip()
        if not value: raise serializers.ValidationError('Name is required.')
        kind=self.initial_data.get('kind',getattr(self.instance,'kind',None))
        qs=ReferenceMaster.objects.filter(kind=kind,name__iexact=value)
        if self.instance: qs=qs.exclude(pk=self.instance.pk)
        if qs.exists(): raise serializers.ValidationError('This item already exists in this master.')
        if kind=='identity_proof':
            def slug_name(name):
                text=unicodedata.normalize('NFKD', name).encode('ascii','ignore').decode('ascii').lower()
                return re.sub(r'[^a-z0-9]+','-',text).strip('-')[:40].strip('-')
            proposed=slug_name(value)
            if not proposed: raise serializers.ValidationError('Identity Proof name must contain letters or numbers.')
            for row in ReferenceMaster.objects.filter(kind='identity_proof'):
                if row.pk != getattr(self.instance,'pk',None) and row.active and slug_name(row.name)==proposed:
                    raise serializers.ValidationError('Another active Identity Proof entry produces the same KYC document code.')
        return value
    def validate(self,attrs):
        import re, unicodedata
        kind=attrs.get('kind',getattr(self.instance,'kind',None))
        active=attrs.get('active',getattr(self.instance,'active',True))
        name=attrs.get('name',getattr(self.instance,'name',''))
        if kind=='identity_proof' and active:
            def slug_name(raw):
                text=unicodedata.normalize('NFKD', raw).encode('ascii','ignore').decode('ascii').lower()
                return re.sub(r'[^a-z0-9]+','-',text).strip('-')[:40].strip('-')
            code=slug_name(name)
            if not code: raise serializers.ValidationError({'name':'Identity Proof name must contain letters or numbers.'})
            for row in ReferenceMaster.objects.filter(kind='identity_proof',active=True):
                if row.pk != getattr(self.instance,'pk',None) and slug_name(row.name)==code:
                    raise serializers.ValidationError({'name':'Another active Identity Proof entry produces the same KYC document code.'})
        return attrs


class PromiseToPaySerializer(serializers.ModelSerializer):
    class Meta:
        model=PromiseToPay
        fields='__all__'
        read_only_fields=['created_by','status']
    def validate(self,attrs):
        from decimal import Decimal
        loan=attrs.get('loan',getattr(self.instance,'loan',None))
        member=attrs.get('member',getattr(self.instance,'member',None))
        amount=attrs.get('promised_amount',getattr(self.instance,'promised_amount',Decimal('0')))
        if loan and member and loan.member_id != member.pk:
            raise serializers.ValidationError({'loan':'Selected loan does not belong to this member.'})
        if amount <= 0:
            raise serializers.ValidationError({'promised_amount':'Promise amount must be greater than zero.'})
        if loan and loan.status in {'closed','rejected','draft'}:
            raise serializers.ValidationError({'loan':'Promise can only be recorded against an active loan.'})
        return attrs

class SettlementCaseSerializer(serializers.ModelSerializer):
    class Meta:
        model=SettlementCase
        fields='__all__'
        read_only_fields=['outstanding_snapshot','discount_amount','status','approval_note','created_by','approved_by','approved_at']
    def validate(self,attrs):
        from decimal import Decimal
        loan=attrs.get('loan',getattr(self.instance,'loan',None))
        member=attrs.get('member',getattr(self.instance,'member',None))
        proposed=attrs.get('proposed_amount',getattr(self.instance,'proposed_amount',Decimal('0')))
        reason=str(attrs.get('reason',getattr(self.instance,'reason',''))).strip()
        if loan and member and loan.member_id != member.pk:
            raise serializers.ValidationError({'loan':'Selected loan does not belong to this member.'})
        if proposed <= 0:
            raise serializers.ValidationError({'proposed_amount':'Settlement amount must be greater than zero.'})
        if len(reason)<5:
            raise serializers.ValidationError({'reason':'Give a reason of at least 5 characters.'})
        if self.instance and self.instance.status!='pending':
            raise serializers.ValidationError('Only pending settlement requests can be edited.')
        return attrs


class MasterCatalogEntrySerializer(serializers.ModelSerializer):
    class Meta:
        model=MasterCatalogEntry
        fields=['id','master_key','name','code','short_name','document_role','ledger_account','metadata','active','notes','created_at','updated_at']
        read_only_fields=['id','created_at','updated_at']
    def validate_code(self,value):
        import re
        value=re.sub(r'[^a-z0-9]+','-',str(value).strip().lower()).strip('-')
        if not value: raise serializers.ValidationError('Code is required.')
        if len(value)>40: raise serializers.ValidationError('Code must be 40 characters or fewer.')
        key=self.initial_data.get('master_key',getattr(self.instance,'master_key',None))
        qs=MasterCatalogEntry.objects.filter(master_key=key,code__iexact=value)
        if self.instance: qs=qs.exclude(pk=self.instance.pk)
        if qs.exists(): raise serializers.ValidationError('This code already exists in the selected master.')
        from .models import KycDocument
        if key=='document_type' and value in {code for code,_ in KycDocument.DOC_TYPES}:
            raise serializers.ValidationError('This code is reserved for a built-in KYC document type. Choose a different code.')
        return value
    def validate_name(self,value):
        value=value.strip()
        if not value: raise serializers.ValidationError('Name is required.')
        key=self.initial_data.get('master_key',getattr(self.instance,'master_key',None))
        qs=MasterCatalogEntry.objects.filter(master_key=key,name__iexact=value)
        if self.instance: qs=qs.exclude(pk=self.instance.pk)
        if qs.exists(): raise serializers.ValidationError('This name already exists in the selected master.')
        return value
    def validate(self,attrs):
        key=attrs.get('master_key',getattr(self.instance,'master_key',None))
        role=attrs.get('document_role',getattr(self.instance,'document_role','other'))
        if key!='document_type' and role!='other':
            raise serializers.ValidationError({'document_role':'Document role only applies to Document Type entries.'})
        account=attrs.get('ledger_account',getattr(self.instance,'ledger_account','') if self.instance else '')
        if key=='collection_mode' and account not in {'Cash','Bank','UPI Clearing','Card Clearing','Gateway Clearing'}:
            raise serializers.ValidationError({'ledger_account':'Choose a supported ledger: Cash, Bank, UPI Clearing, Card Clearing or Gateway Clearing.'})
        if key!='collection_mode' and account:
            raise serializers.ValidationError({'ledger_account':'Ledger mapping only applies to Collection Mode entries.'})
        return attrs

class PenaltySchemeSerializer(serializers.ModelSerializer):
    class Meta:
        model=PenaltyScheme
        fields='__all__'
        read_only_fields=['id','created_at','updated_at']
    def validate_name(self,value):
        value=value.strip()
        if not value: raise serializers.ValidationError('Penalty scheme name is required.')
        qs=PenaltyScheme.objects.filter(name__iexact=value)
        if self.instance: qs=qs.exclude(pk=self.instance.pk)
        if qs.exists(): raise serializers.ValidationError('A penalty scheme with this name already exists.')
        return value
    def validate_grace_period_days(self,value):
        if value<0 or value>365: raise serializers.ValidationError('Grace period must be between 0 and 365 days.')
        return value
    def validate_penalty_value(self,value):
        from decimal import Decimal
        if value<0: raise serializers.ValidationError('Penalty value cannot be negative.')
        kind=self.initial_data.get('penalty_type',getattr(self.instance,'penalty_type','fixed') if self.instance else 'fixed')
        if kind=='percentage' and value>Decimal('100'): raise serializers.ValidationError('Penalty percentage must be between 0 and 100.')
        return value
    def validate_minimum_due_amount(self,value):
        if value<0: raise serializers.ValidationError('Minimum due amount cannot be negative.')
        return value
    def validate(self,attrs):
        typ=attrs.get('penalty_type',getattr(self.instance,'penalty_type','fixed') if self.instance else 'fixed')
        val=attrs.get('penalty_value',getattr(self.instance,'penalty_value',0) if self.instance else 0)
        if typ=='percentage' and val>100: raise serializers.ValidationError({'penalty_value':'Percentage must not exceed 100.'})
        mode=attrs.get('penalty_mode',getattr(self.instance,'penalty_mode','one_time') if self.instance else 'one_time')
        recurring=attrs.get('recurring',getattr(self.instance,'recurring',False) if self.instance else False)
        if mode=='one_time' and recurring:
            raise serializers.ValidationError({'recurring':'Recurring charges are only valid for Daily penalty mode.'})
        if self.instance:
            used_products=LoanProduct.objects.filter(penalty_scheme=self.instance,loans__isnull=False).distinct()
            financial_fields=('grace_period_days','penalty_type','penalty_value','minimum_due_amount','penalty_mode','recurring')
            changed=[f for f in financial_fields if f in attrs and attrs[f] != getattr(self.instance,f)]
            if changed and used_products.exists():
                raise serializers.ValidationError({f:'This scheme is used by issued loans. Create a new Penalty Scheme and Loan Plan version instead of changing contractual penalty terms.' for f in changed})
            if attrs.get('active') is False and used_products.exists():
                raise serializers.ValidationError({'active':'This scheme is attached to issued loans and cannot be deactivated while those loans may still accrue penalties.'})
        return attrs

class SoftwareTimingSerializer(serializers.ModelSerializer):
    class Meta:
        model=SoftwareTiming
        fields='__all__'
        read_only_fields=['id','created_at','updated_at']
    def validate(self,attrs):
        start=attrs.get('office_start',getattr(self.instance,'office_start',None))
        end=attrs.get('office_end',getattr(self.instance,'office_end',None))
        if start and end and start>=end:
            raise serializers.ValidationError({'office_end':'Office end time must be later than office start time.'})
        minutes=attrs.get('auto_logout_minutes',getattr(self.instance,'auto_logout_minutes',0))
        if minutes not in (0,) and not 5<=minutes<=1440:
            raise serializers.ValidationError({'auto_logout_minutes':'Choose 0 (disabled) or 5 to 1440 minutes.'})
        days=attrs.get('working_days',getattr(self.instance,'working_days',[])) or []
        valid={'mon','tue','wed','thu','fri','sat','sun'}
        if not isinstance(days,list) or any(d not in valid for d in days):
            raise serializers.ValidationError({'working_days':'Working days must be selected from mon, tue, wed, thu, fri, sat, sun.'})
        from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
        zone=attrs.get('timezone_name',getattr(self.instance,'timezone_name','Asia/Kolkata'))
        try: ZoneInfo(zone)
        except (ZoneInfoNotFoundError,ValueError,TypeError):
            raise serializers.ValidationError({'timezone_name':'Enter a valid IANA time-zone name, for example Asia/Kolkata.'})
        return attrs

class FinancialPeriodLockRequestSerializer(serializers.ModelSerializer):
    created_by_name=serializers.CharField(source='created_by.username',read_only=True)
    decided_by_name=serializers.CharField(source='decided_by.username',read_only=True,default='')
    class Meta:
        model=FinancialPeriodLockRequest
        fields='__all__'
        read_only_fields=['id','status','created_by','decided_by','decision_note','decided_at','created_at','updated_at']


class PaymentReversalRequestSerializer(serializers.ModelSerializer):
    receipt_no=serializers.CharField(source='payment.receipt_no',read_only=True)
    payment_amount=serializers.DecimalField(source='payment.amount',max_digits=14,decimal_places=2,read_only=True)
    payment_member=serializers.CharField(source='payment.member.name',read_only=True)
    created_by_name=serializers.CharField(source='created_by.username',read_only=True)
    decided_by_name=serializers.CharField(source='decided_by.username',read_only=True,default='')
    class Meta:
        model=PaymentReversalRequest
        fields='__all__'
        read_only_fields=['id','status','created_by','decided_by','decision_note','decided_at','reversal_reference','created_at','updated_at']


class FinancialSessionSerializer(serializers.ModelSerializer):
    class Meta:
        model=FinancialSession
        fields='__all__'
        read_only_fields=['id','created_at','updated_at']
    def validate(self,attrs):
        start=attrs.get('start_date',getattr(self.instance,'start_date',None))
        end=attrs.get('end_date',getattr(self.instance,'end_date',None))
        active=attrs.get('active',getattr(self.instance,'active',True))
        if start and end and start>end: raise serializers.ValidationError({'end_date':'Session end date must be on or after the start date.'})
        if active and start and end:
            qs=FinancialSession.objects.filter(active=True,start_date__lte=end,end_date__gte=start)
            if self.instance: qs=qs.exclude(pk=self.instance.pk)
            if qs.exists(): raise serializers.ValidationError({'start_date':'Active financial session date ranges cannot overlap.'})
        return attrs

class BusinessSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model=BusinessSettings
        fields=['id','key','values','updated_by','created_at','updated_at']
        read_only_fields=['id','key','updated_by','created_at','updated_at']
    BOOLEAN_KEYS={
      'customer_kyc_mandatory','member_age_limit_option','show_all_members','head_office_branch_disbursement',
      'disbursement_after_approval','auto_approve_member_collection','interest_plan_delete_pending_emi_loan_complete',
      'single_customer_multiple_disbursement_in_day','single_loan_multiple_collection_in_day','sms_customer_registration',
      'sms_password_reset','sms_due_reminder','sms_overdue_reminder','sms_member_verify_otp','sms_staff_verify_otp',
      'sms_salary_disbursement','sms_customer_loan_disbursement','sms_emi_collected_by_staff','sms_emi_approval',
      'sms_document_verification','enable_email_service','update_loan_close_date'}
    INTEGER_RANGES={'decimal_places':(0,4),'amount_words_decimal_places':(0,4),'minimum_member_age':(0,120),'maximum_member_age':(0,120),'emi_reminder_sms_days':(0,365),'overdue_reminder_sms_days':(0,365)}
    TEXT_LIMITS={
      'company_name':180,'company_short_name':80,'formal_name':180,'website':255,'about_company':4000,'logo_data':2000000,'favicon_data':2000000,
      'qr_code_data':2000000,'upi_id':120,'gst_number':20,'pan_number':10,'tan_number':20,'cin':30,'company_class':100,
      'currency_symbol':10,'contact_number_1':30,'contact_number_2':30,'landline':30,'address':2000,'city':100,'pincode':12,
      'state':100,'contact_email':254,'fax':50,'state_of_registration':100,'company_category':100,
      'incorporation_date':10,'incorporation_country':100,'amount_after_decimal_word':80}
    DECIMAL_KEYS={'authorized_capital','paid_up_capital','share_nominal_value'}
    def validate_values(self,value):
        from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
        if not isinstance(value,dict): raise serializers.ValidationError('Settings must be an object of named configuration values.')
        merged={}
        for k,v in value.items():
            if k in self.BOOLEAN_KEYS:
                if not isinstance(v,bool): raise serializers.ValidationError({k:'This setting must be true or false.'})
            elif k in self.INTEGER_RANGES:
                if isinstance(v,bool) or not isinstance(v,int): raise serializers.ValidationError({k:'This setting must be a whole number.'})
                lo,hi=self.INTEGER_RANGES[k]
                if not lo<=v<=hi: raise serializers.ValidationError({k:f'Value must be between {lo} and {hi}.'})
            elif k in self.DECIMAL_KEYS:
                try: amount=Decimal(str(v))
                except (InvalidOperation,ValueError): raise serializers.ValidationError({k:'Enter a valid amount.'})
                if not amount.is_finite() or amount<0 or amount>Decimal('999999999999.99'): raise serializers.ValidationError({k:'Amount must be between 0 and INR 999,999,999,999.99.'})
                merged[k]=str(amount.quantize(Decimal('0.01'),rounding=ROUND_HALF_UP)); continue
            elif k in self.TEXT_LIMITS:
                if not isinstance(v,str): raise serializers.ValidationError({k:'This field must be text.'})
                if len(v)>self.TEXT_LIMITS[k]: raise serializers.ValidationError({k:f'Maximum length is {self.TEXT_LIMITS[k]} characters.'})
                if k=='pan_number' and v and (len(v)!=10 or not v[:5].isalpha() or not v[5:9].isdigit() or not v[9].isalpha()):
                    raise serializers.ValidationError({k:'PAN must be in ABCDE1234F format.'})
                if k=='contact_email' and v and '@' not in v: raise serializers.ValidationError({k:'Enter a valid email address.'})
                if k=='website' and v and not v.startswith(('https://','http://')): raise serializers.ValidationError({k:'Website must begin with http:// or https://.'})
                if k=='incorporation_date' and v:
                    from datetime import date
                    try: date.fromisoformat(v)
                    except ValueError: raise serializers.ValidationError({k:'Use YYYY-MM-DD format.'})
            elif k in {'sms_gateway_url'}:
                if not isinstance(v,str): raise serializers.ValidationError({k:'URL must be text.'})
                if v and (v.strip()!=v or not v.startswith('https://')): raise serializers.ValidationError({k:'SMS gateway URL must use HTTPS and contain no leading/trailing spaces.'})
                if len(v)>500: raise serializers.ValidationError({k:'URL is too long.'})
            else:
                raise serializers.ValidationError({k:'Unknown setting key. This key is not supported by this version.'})
            merged[k]=v
        # Merge patches safely so updating one field never drops unrelated settings.
        current=dict(getattr(self.instance,'values',{}) or {})
        current.update(merged)
        if current.get('member_age_limit_option'):
            low=current.get('minimum_member_age',0); high=current.get('maximum_member_age',120)
            if low>high: raise serializers.ValidationError({'maximum_member_age':'Maximum age must be greater than or equal to minimum age.'})
        return current


class PenaltyAssessmentSerializer(serializers.ModelSerializer):
    installment_number=serializers.IntegerField(source='installment.number',read_only=True)
    loan_id=serializers.IntegerField(source='installment.loan_id',read_only=True)
    member_name=serializers.CharField(source='installment.loan.member.name',read_only=True)
    scheme_name=serializers.CharField(source='scheme.name',read_only=True,allow_null=True)
    class Meta:
        model=PenaltyAssessment
        fields=['id','installment','installment_number','loan_id','member_name','scheme','scheme_name','assessment_date','assessment_key','source','overdue_days','overdue_amount','amount','created_at']
        read_only_fields=fields


class SeriesConfigurationSerializer(serializers.ModelSerializer):
    class Meta:
        model=SeriesConfiguration
        fields=['id','key','label','prefix','next_number','include_branch_code','include_financial_year','created_at','updated_at']
        read_only_fields=['id','created_at','updated_at']
    def validate_prefix(self,value):
        value=value.strip().upper()
        if len(value)>20: raise serializers.ValidationError('Prefix must be 20 characters or fewer.')
        return value


class HouseholdIncomeAssessmentSerializer(serializers.ModelSerializer):
    member_name=serializers.CharField(source='member.name',read_only=True)
    member_no=serializers.CharField(source='member.member_no',read_only=True)
    repayment_ratio_percent=serializers.SerializerMethodField()
    class Meta:
        model=HouseholdIncomeAssessment; fields='__all__'
        read_only_fields=['id','verified','assessed_by','verified_by','verified_at','created_at','updated_at','member_name','member_no','repayment_ratio_percent']
    def get_repayment_ratio_percent(self,obj):
        if not obj.monthly_household_income: return None
        return str(((obj.existing_monthly_loan_obligations+obj.proposed_monthly_obligation)*100/obj.monthly_household_income).quantize(__import__('decimal').Decimal('0.01')))
    def validate(self,attrs):
        income=attrs.get('monthly_household_income',getattr(self.instance,'monthly_household_income',None))
        existing=attrs.get('existing_monthly_loan_obligations',getattr(self.instance,'existing_monthly_loan_obligations',0))
        proposed=attrs.get('proposed_monthly_obligation',getattr(self.instance,'proposed_monthly_obligation',0))
        if income is None or income < 0: raise serializers.ValidationError({'monthly_household_income':'Income must be zero or greater.'})
        if existing < 0 or proposed < 0: raise serializers.ValidationError('Monthly obligations cannot be negative.')
        request=self.context.get('request'); member=attrs.get('member',getattr(self.instance,'member',None))
        if request and member:
            profile=getattr(request.user,'staff_profile',None)
            if profile and profile.role!='admin' and (not profile.branch_id or member.branch_id!=profile.branch_id):
                raise serializers.ValidationError({'member':'Member must belong to your assigned branch.'})
        return attrs


class CustomerComplaintSerializer(serializers.ModelSerializer):
    member_name=serializers.CharField(source='member.name',read_only=True,allow_null=True)
    branch_name=serializers.CharField(source='branch.name',read_only=True)
    assigned_employee_name=serializers.CharField(source='assigned_employee.name',read_only=True,allow_null=True)
    class Meta:
        model=CustomerComplaint; fields='__all__'
        read_only_fields=['id','complaint_no','created_by','resolved_by','resolved_at','created_at','updated_at','member_name','branch_name','assigned_employee_name']
    def validate(self,attrs):
        branch=attrs.get('branch',getattr(self.instance,'branch',None)); member=attrs.get('member',getattr(self.instance,'member',None)); employee=attrs.get('assigned_employee',getattr(self.instance,'assigned_employee',None))
        if member and branch and member.branch_id != branch.id: raise serializers.ValidationError({'member':'Member must belong to the complaint branch.'})
        if employee and branch and employee.branch_id != branch.id: raise serializers.ValidationError({'assigned_employee':'Assigned employee must belong to the complaint branch.'})
        due=attrs.get('due_date',getattr(self.instance,'due_date',None)); received=attrs.get('received_date',getattr(self.instance,'received_date',None))
        if due and received and due < received: raise serializers.ValidationError({'due_date':'Due date cannot be before received date.'})
        status=attrs.get('status',getattr(self.instance,'status','open'))
        if self.instance and self.instance.status in {'resolved','rejected'} and status != self.instance.status:
            raise serializers.ValidationError({'status':'A resolved/rejected complaint cannot be reopened or reclassified; create a follow-up complaint instead.'})
        resolution=str(attrs.get('resolution_note',getattr(self.instance,'resolution_note','')) or '').strip()
        if status in {'resolved','rejected'} and len(resolution)<5:
            raise serializers.ValidationError({'resolution_note':'Resolution/rejection note of at least 5 characters is required.'})
        request=self.context.get('request')
        if request:
            profile=getattr(request.user,'staff_profile',None)
            if profile and profile.role!='admin' and (not profile.branch_id or not branch or branch.id!=profile.branch_id):
                raise serializers.ValidationError({'branch':'You can only create complaints for your assigned branch.'})
        return attrs


class FieldVisitRecordSerializer(serializers.ModelSerializer):
    member_name=serializers.CharField(source='member.name',read_only=True)
    loan_id_display=serializers.CharField(source='loan.id',read_only=True,allow_null=True)
    employee_name=serializers.CharField(source='employee.name',read_only=True)
    class Meta:
        model=FieldVisitRecord; fields='__all__'
        read_only_fields=['id','created_by','created_at','updated_at','member_name','loan_id_display','employee_name']
    def validate(self,attrs):
        member=attrs.get('member',getattr(self.instance,'member',None)); loan=attrs.get('loan',getattr(self.instance,'loan',None)); employee=attrs.get('employee',getattr(self.instance,'employee',None))
        if loan and member and loan.member_id != member.id: raise serializers.ValidationError({'loan':'Loan must belong to the selected member.'})
        if employee and member and employee.branch_id != member.branch_id: raise serializers.ValidationError({'employee':'Field officer must belong to the member branch.'})
        amount=attrs.get('promised_amount',getattr(self.instance,'promised_amount',None))
        if amount is not None and amount < 0: raise serializers.ValidationError({'promised_amount':'Promised amount cannot be negative.'})
        request=self.context.get('request')
        if request and member:
            profile=getattr(request.user,'staff_profile',None)
            if profile and profile.role!='admin' and (not profile.branch_id or member.branch_id!=profile.branch_id):
                raise serializers.ValidationError({'member':'Member must belong to your assigned branch.'})
        return attrs


class CashHandoverRequestSerializer(serializers.ModelSerializer):
    branch_name=serializers.CharField(source='branch.name',read_only=True)
    from_employee_name=serializers.CharField(source='from_employee.name',read_only=True)
    to_employee_name=serializers.CharField(source='to_employee.name',read_only=True)
    class Meta:
        model=CashHandoverRequest; fields='__all__'
        read_only_fields=['id','status','decision_note','created_by','decided_by','decided_at','created_at','updated_at','branch_name','from_employee_name','to_employee_name']
    def validate(self,attrs):
        branch=attrs.get('branch',getattr(self.instance,'branch',None)); sender=attrs.get('from_employee',getattr(self.instance,'from_employee',None)); receiver=attrs.get('to_employee',getattr(self.instance,'to_employee',None)); amount=attrs.get('amount',getattr(self.instance,'amount',0)); note=str(attrs.get('note',getattr(self.instance,'note','')) or '').strip(); key=str(attrs.get('idempotency_key',getattr(self.instance,'idempotency_key','')) or '').strip()
        if amount <= 0: raise serializers.ValidationError({'amount':'Amount must be greater than zero.'})
        if sender and receiver and sender.pk==receiver.pk: raise serializers.ValidationError({'to_employee':'Sender and receiver must be different employees.'})
        if branch and sender and sender.branch_id != branch.id: raise serializers.ValidationError({'from_employee':'Sender must belong to the selected branch.'})
        if branch and receiver and receiver.branch_id != branch.id: raise serializers.ValidationError({'to_employee':'Receiver must belong to the selected branch.'})
        if len(note)<5: raise serializers.ValidationError({'note':'Provide a handover note of at least 5 characters.'})
        if len(key)<8: raise serializers.ValidationError({'idempotency_key':'A unique idempotency key of at least 8 characters is required.'})
        request=self.context.get('request')
        if request and branch:
            profile=getattr(request.user,'staff_profile',None)
            if profile and profile.role!='admin' and (not profile.branch_id or branch.id!=profile.branch_id):
                raise serializers.ValidationError({'branch':'You can only request cash handover for your assigned branch.'})
        if self.instance and self.instance.status!='pending': raise serializers.ValidationError({'status':'Only pending handovers can be edited.'})
        attrs['note']=note; attrs['idempotency_key']=key
        return attrs
