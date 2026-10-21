# Added for V140: holiday calendar, maker-checker loan top-ups and deposit collection ledger.
from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import django.utils.timezone


class Migration(migrations.Migration):
    dependencies = [
        ('finance', '0025_series_configuration'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]
    operations = [
        migrations.CreateModel(
            name='HolidayCalendar',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('holiday_date', models.DateField()),
                ('name', models.CharField(max_length=140)),
                ('holiday_type', models.CharField(choices=[('public','Public Holiday'),('regional','Regional Holiday'),('office','Office Closure'),('working','Special Working Day')], default='public', max_length=20)),
                ('description', models.CharField(blank=True, max_length=255)),
                ('active', models.BooleanField(default=True)),
                ('branch', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name='holidays', to='finance.branch')),
                ('created_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name='holidays_created', to=settings.AUTH_USER_MODEL)),
            ],
            options={'ordering':['holiday_date','name']},
        ),
        migrations.AddConstraint(model_name='holidaycalendar', constraint=models.UniqueConstraint(fields=('branch','holiday_date','name'), name='uniq_holiday_branch_date_name')),
        migrations.CreateModel(
            name='LoanTopUpRequest',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('amount', models.DecimalField(decimal_places=2, max_digits=14)),
                ('reason', models.TextField()),
                ('status', models.CharField(choices=[('pending','Pending Approval'),('approved','Approved'),('rejected','Rejected'),('disbursed','Disbursed')], default='pending', max_length=20)),
                ('approval_note', models.TextField(blank=True)),
                ('approved_at', models.DateTimeField(blank=True, null=True)),
                ('approved_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name='loan_topups_approved', to=settings.AUTH_USER_MODEL)),
                ('created_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name='loan_topups_created', to=settings.AUTH_USER_MODEL)),
                ('disbursed_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name='loan_topups_disbursed', to=settings.AUTH_USER_MODEL)),
                ('loan', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='topup_requests', to='finance.loan')),
                ('resulting_loan', models.OneToOneField(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name='source_topup_request', to='finance.loan')),
            ],
            options={'ordering':['-created_at','-id']},
        ),
        migrations.AddConstraint(model_name='loantopuprequest', constraint=models.UniqueConstraint(condition=models.Q(status='pending'), fields=('loan',), name='uniq_pending_topup_per_loan')),
        migrations.CreateModel(
            name='DepositAccount',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('account_no', models.CharField(blank=True, max_length=40, unique=True)),
                ('account_type', models.CharField(choices=[('savings','Savings'),('recurring','Recurring Deposit'),('fixed','Fixed Deposit')], default='savings', max_length=20)),
                ('opened_on', models.DateField(default=django.utils.timezone.localdate)),
                ('balance', models.DecimalField(decimal_places=2, default=0, max_digits=14)),
                ('status', models.CharField(choices=[('active','Active'),('closed','Closed'),('frozen','Frozen')], default='active', max_length=20)),
                ('created_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name='deposit_accounts_created', to=settings.AUTH_USER_MODEL)),
                ('member', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='deposit_accounts', to='finance.member')),
            ],
            options={'ordering':['-created_at','-id']},
        ),
        migrations.CreateModel(
            name='DepositCollection',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('amount', models.DecimalField(decimal_places=2, max_digits=14)),
                ('collection_date', models.DateField(default=django.utils.timezone.localdate)),
                ('method', models.CharField(choices=[('cash','Cash'),('bank','Bank'),('upi','UPI')], default='cash', max_length=20)),
                ('bank_account', models.CharField(blank=True, default='', max_length=120)),
                ('reference', models.CharField(blank=True, default='', max_length=120)),
                ('status', models.CharField(choices=[('pending','Pending Approval'),('approved','Approved'),('rejected','Rejected')], default='pending', max_length=20)),
                ('approval_note', models.TextField(blank=True)),
                ('journal_reference', models.CharField(blank=True, default='', max_length=60, unique=True)),
                ('account', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='collections', to='finance.depositaccount')),
                ('approved_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name='deposit_collections_approved', to=settings.AUTH_USER_MODEL)),
                ('created_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name='deposit_collections_created', to=settings.AUTH_USER_MODEL)),
                ('approved_at', models.DateTimeField(blank=True, null=True)),
            ],
            options={'ordering':['-collection_date','-id']},
        ),
    ]
