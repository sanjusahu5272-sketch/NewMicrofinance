# Additive V146 operational safety models. No existing financial rows are changed.
from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import django.utils.timezone

class Migration(migrations.Migration):
    dependencies = [
        ('finance', '0028_overdue_transfer_workflow'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]
    operations = [
        migrations.CreateModel(name='HouseholdIncomeAssessment', fields=[
            ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
            ('created_at', models.DateTimeField(auto_now_add=True)), ('updated_at', models.DateTimeField(auto_now=True)),
            ('assessment_date', models.DateField(default=django.utils.timezone.localdate)),
            ('monthly_household_income', models.DecimalField(decimal_places=2,max_digits=14)),
            ('existing_monthly_loan_obligations', models.DecimalField(decimal_places=2,default=0,max_digits=14)),
            ('proposed_monthly_obligation', models.DecimalField(decimal_places=2,default=0,max_digits=14)),
            ('household_size', models.PositiveSmallIntegerField(default=1)), ('other_lender_details', models.TextField(blank=True)),
            ('verified', models.BooleanField(default=False)), ('verification_note', models.TextField(blank=True)),
            ('verified_at', models.DateTimeField(blank=True,null=True)),
            ('assessed_by', models.ForeignKey(blank=True,null=True,on_delete=django.db.models.deletion.PROTECT,related_name='household_assessments_created',to=settings.AUTH_USER_MODEL)),
            ('verified_by', models.ForeignKey(blank=True,null=True,on_delete=django.db.models.deletion.PROTECT,related_name='household_assessments_verified',to=settings.AUTH_USER_MODEL)),
            ('member', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT,related_name='income_assessments',to='finance.member')),
        ], options={'ordering':['-assessment_date','-id']}),
        migrations.AddConstraint(model_name='householdincomeassessment',constraint=models.CheckConstraint(condition=models.Q(('monthly_household_income__gte',0)),name='household_income_nonnegative')),
        migrations.AddConstraint(model_name='householdincomeassessment',constraint=models.CheckConstraint(condition=models.Q(('existing_monthly_loan_obligations__gte',0)),name='household_existing_obligation_nonnegative')),
        migrations.AddConstraint(model_name='householdincomeassessment',constraint=models.CheckConstraint(condition=models.Q(('proposed_monthly_obligation__gte',0)),name='household_proposed_obligation_nonnegative')),
        migrations.AddConstraint(model_name='householdincomeassessment',constraint=models.CheckConstraint(condition=models.Q(('household_size__gte',1)),name='household_size_at_least_one')),
        migrations.CreateModel(name='CustomerComplaint', fields=[
            ('id', models.BigAutoField(auto_created=True,primary_key=True,serialize=False,verbose_name='ID')),
            ('created_at',models.DateTimeField(auto_now_add=True)),('updated_at',models.DateTimeField(auto_now=True)),
            ('complaint_no',models.CharField(max_length=40,unique=True)),
            ('category',models.CharField(choices=[('collection','Collection conduct'),('payment','Payment/receipt'),('loan_terms','Loan terms/charges'),('staff','Staff conduct'),('privacy','Data/privacy'),('other','Other')],default='other',max_length=30)),
            ('subject',models.CharField(max_length=180)),('description',models.TextField()),('received_date',models.DateField(default=django.utils.timezone.localdate)),
            ('due_date',models.DateField(blank=True,null=True)),('status',models.CharField(choices=[('open','Open'),('in_review','In Review'),('resolved','Resolved'),('rejected','Rejected')],default='open',max_length=20)),
            ('resolution_note',models.TextField(blank=True)),('resolved_at',models.DateTimeField(blank=True,null=True)),
            ('assigned_employee',models.ForeignKey(blank=True,null=True,on_delete=django.db.models.deletion.PROTECT,related_name='assigned_complaints',to='finance.employee')),
            ('branch',models.ForeignKey(on_delete=django.db.models.deletion.PROTECT,related_name='customer_complaints',to='finance.branch')),
            ('created_by',models.ForeignKey(blank=True,null=True,on_delete=django.db.models.deletion.PROTECT,related_name='customer_complaints_created',to=settings.AUTH_USER_MODEL)),
            ('member',models.ForeignKey(blank=True,null=True,on_delete=django.db.models.deletion.PROTECT,related_name='complaints',to='finance.member')),
            ('resolved_by',models.ForeignKey(blank=True,null=True,on_delete=django.db.models.deletion.PROTECT,related_name='customer_complaints_resolved',to=settings.AUTH_USER_MODEL)),
        ], options={'ordering':['-received_date','-id']}),
        migrations.CreateModel(name='FieldVisitRecord', fields=[
            ('id',models.BigAutoField(auto_created=True,primary_key=True,serialize=False,verbose_name='ID')),
            ('created_at',models.DateTimeField(auto_now_add=True)),('updated_at',models.DateTimeField(auto_now=True)),
            ('visit_date',models.DateTimeField(default=django.utils.timezone.now)),('purpose',models.CharField(max_length=180)),
            ('outcome',models.CharField(choices=[('contacted','Customer Contacted'),('not_available','Customer Not Available'),('promise','Promise to Pay'),('dispute','Dispute Raised'),('follow_up','Follow-up Required'),('other','Other')],default='contacted',max_length=30)),
            ('notes',models.TextField(blank=True)),('promised_date',models.DateField(blank=True,null=True)),('promised_amount',models.DecimalField(blank=True,decimal_places=2,max_digits=14,null=True)),
            ('created_by',models.ForeignKey(blank=True,null=True,on_delete=django.db.models.deletion.PROTECT,related_name='field_visits_created',to=settings.AUTH_USER_MODEL)),
            ('employee',models.ForeignKey(on_delete=django.db.models.deletion.PROTECT,related_name='field_visits',to='finance.employee')),
            ('loan',models.ForeignKey(blank=True,null=True,on_delete=django.db.models.deletion.PROTECT,related_name='field_visits',to='finance.loan')),
            ('member',models.ForeignKey(on_delete=django.db.models.deletion.PROTECT,related_name='field_visits',to='finance.member')),
        ], options={'ordering':['-visit_date','-id']}),
        migrations.CreateModel(name='CashHandoverRequest', fields=[
            ('id',models.BigAutoField(auto_created=True,primary_key=True,serialize=False,verbose_name='ID')),
            ('created_at',models.DateTimeField(auto_now_add=True)),('updated_at',models.DateTimeField(auto_now=True)),
            ('handover_date',models.DateField(default=django.utils.timezone.localdate)),('amount',models.DecimalField(decimal_places=2,max_digits=14)),
            ('reference',models.CharField(blank=True,max_length=120)),('note',models.TextField()),('idempotency_key',models.CharField(max_length=100,unique=True)),
            ('status',models.CharField(choices=[('pending','Pending Approval'),('approved','Approved'),('rejected','Rejected')],default='pending',max_length=20)),
            ('decision_note',models.TextField(blank=True)),('decided_at',models.DateTimeField(blank=True,null=True)),
            ('branch',models.ForeignKey(on_delete=django.db.models.deletion.PROTECT,related_name='cash_handovers',to='finance.branch')),
            ('created_by',models.ForeignKey(on_delete=django.db.models.deletion.PROTECT,related_name='cash_handovers_created',to=settings.AUTH_USER_MODEL)),
            ('decided_by',models.ForeignKey(blank=True,null=True,on_delete=django.db.models.deletion.PROTECT,related_name='cash_handovers_decided',to=settings.AUTH_USER_MODEL)),
            ('from_employee',models.ForeignKey(on_delete=django.db.models.deletion.PROTECT,related_name='cash_handovers_out',to='finance.employee')),
            ('to_employee',models.ForeignKey(on_delete=django.db.models.deletion.PROTECT,related_name='cash_handovers_in',to='finance.employee')),
        ], options={'ordering':['-handover_date','-id']}),
        migrations.AddConstraint(model_name='cashhandoverrequest',constraint=models.CheckConstraint(condition=models.Q(('amount__gt',0)),name='cash_handover_amount_positive')),
        migrations.AddConstraint(model_name='cashhandoverrequest',constraint=models.UniqueConstraint(condition=models.Q(('status','pending')),fields=('from_employee','to_employee','handover_date'),name='uniq_pending_cash_handover_pair_day')),
    ]
