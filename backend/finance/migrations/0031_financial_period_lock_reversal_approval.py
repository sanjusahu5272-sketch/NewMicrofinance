from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion

class Migration(migrations.Migration):
    dependencies = [
        ('finance', '0030_journal_chart_account_mapping'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]
    operations = [
        migrations.AlterField(
            model_name='payment', name='status',
            field=models.CharField(choices=[('success','Success'),('pending','Pending Approval'),('failed','Failed'),('rejected','Rejected'),('refunded','Refunded'),('reversed','Ledger Reversed — External Refund Not Confirmed')],default='success',max_length=20),
        ),
        migrations.CreateModel(
            name='FinancialPeriodLockRequest',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('start_date', models.DateField()),
                ('end_date', models.DateField()),
                ('reason', models.TextField()),
                ('status', models.CharField(choices=[('pending','Pending Approval'),('approved','Locked'),('rejected','Rejected')],default='pending',max_length=20)),
                ('decision_note', models.TextField(blank=True)),
                ('decided_at', models.DateTimeField(blank=True,null=True)),
                ('created_by', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT,related_name='financial_locks_created',to=settings.AUTH_USER_MODEL)),
                ('decided_by', models.ForeignKey(blank=True,null=True,on_delete=django.db.models.deletion.PROTECT,related_name='financial_locks_decided',to=settings.AUTH_USER_MODEL)),
            ],
            options={'ordering':['-created_at','-id']},
        ),
        migrations.AddIndex(model_name='financialperiodlockrequest',index=models.Index(fields=['status','start_date','end_date'],name='fin_lock_status_dates_idx')),
        migrations.CreateModel(
            name='PaymentReversalRequest',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('reason', models.TextField()),
                ('status', models.CharField(choices=[('pending','Pending Approval'),('approved','Approved / Reversed'),('rejected','Rejected')],default='pending',max_length=20)),
                ('idempotency_key', models.CharField(blank=True,max_length=100,null=True,unique=True)),
                ('decision_note', models.TextField(blank=True)),
                ('decided_at', models.DateTimeField(blank=True,null=True)),
                ('reversal_reference', models.CharField(blank=True,max_length=120)),
                ('created_by', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT,related_name='payment_reversals_created',to=settings.AUTH_USER_MODEL)),
                ('decided_by', models.ForeignKey(blank=True,null=True,on_delete=django.db.models.deletion.PROTECT,related_name='payment_reversals_decided',to=settings.AUTH_USER_MODEL)),
                ('payment', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT,related_name='reversal_requests',to='finance.payment')),
            ],
            options={'ordering':['-created_at','-id']},
        ),
        migrations.AddConstraint(model_name='paymentreversalrequest',constraint=models.UniqueConstraint(condition=models.Q(('status','pending')),fields=('payment',),name='uniq_pending_payment_reversal')),
    ]
