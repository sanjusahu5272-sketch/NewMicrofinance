# Additive migration: recovery assignments are operational responsibility only;
# no existing loan, member, installment, or journal row is rewritten.
from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion

class Migration(migrations.Migration):
    dependencies = [
        ('finance', '0027_branch_scoped_ledger_transfers'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='OverdueTransferRequest',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('reason', models.TextField()),
                ('idempotency_key', models.CharField(max_length=100, unique=True)),
                ('overdue_amount_snapshot', models.DecimalField(decimal_places=2, max_digits=14)),
                ('overdue_installments_snapshot', models.PositiveIntegerField(default=0)),
                ('status', models.CharField(choices=[('pending', 'Pending Approval'), ('approved', 'Approved'), ('rejected', 'Rejected')], default='pending', max_length=20)),
                ('decision_note', models.TextField(blank=True)),
                ('decided_at', models.DateTimeField(blank=True, null=True)),
                ('created_by', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='overdue_transfers_created', to=settings.AUTH_USER_MODEL)),
                ('decided_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name='overdue_transfers_decided', to=settings.AUTH_USER_MODEL)),
                ('from_branch', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='outgoing_overdue_transfers', to='finance.branch')),
                ('from_employee', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name='outgoing_overdue_transfers', to='finance.employee')),
                ('loan', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='overdue_transfer_requests', to='finance.loan')),
                ('to_branch', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='incoming_overdue_transfers', to='finance.branch')),
                ('to_employee', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='incoming_overdue_transfers', to='finance.employee')),
            ],
            options={'ordering': ['-created_at', '-id']},
        ),
        migrations.CreateModel(
            name='LoanRecoveryAssignment',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('branch', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='recovery_assignments', to='finance.branch')),
                ('employee', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='recovery_assignments', to='finance.employee')),
                ('loan', models.OneToOneField(on_delete=django.db.models.deletion.PROTECT, related_name='recovery_assignment', to='finance.loan')),
                ('source_transfer', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name='resulting_assignments', to='finance.overduetransferrequest')),
                ('updated_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name='recovery_assignments_updated', to=settings.AUTH_USER_MODEL)),
            ],
        ),
        migrations.AddConstraint(
            model_name='overduetransferrequest',
            constraint=models.UniqueConstraint(condition=models.Q(('status', 'pending')), fields=('loan',), name='uniq_pending_overdue_transfer_loan'),
        ),
    ]
