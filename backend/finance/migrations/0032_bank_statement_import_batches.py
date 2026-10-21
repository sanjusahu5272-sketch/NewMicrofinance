from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion

class Migration(migrations.Migration):
    dependencies = [
        ('finance', '0031_financial_period_lock_reversal_approval'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]
    operations = [
        migrations.CreateModel(
            name='BankStatementImportBatch',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('bank_account', models.CharField(max_length=120)),
                ('file_name', models.CharField(max_length=255)),
                ('file_sha256', models.CharField(max_length=64, unique=True)),
                ('statement_start', models.DateField()),
                ('statement_end', models.DateField()),
                ('opening_balance', models.DecimalField(decimal_places=2, max_digits=16)),
                ('closing_balance', models.DecimalField(decimal_places=2, max_digits=16)),
                ('total_debit', models.DecimalField(decimal_places=2, default=0, max_digits=16)),
                ('total_credit', models.DecimalField(decimal_places=2, default=0, max_digits=16)),
                ('row_count', models.PositiveIntegerField(default=0)),
                ('status', models.CharField(choices=[('imported', 'Imported'), ('reconciled', 'Reconciled')], default='imported', max_length=20)),
                ('reconciled_at', models.DateTimeField(blank=True, null=True)),
                ('reconciliation_note', models.TextField(blank=True)),
                ('created_by', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='bank_statement_batches_created', to=settings.AUTH_USER_MODEL)),
                ('reconciled_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name='bank_statement_batches_reconciled', to=settings.AUTH_USER_MODEL)),
            ],
            options={'ordering': ['-created_at', '-id']},
        ),
        migrations.AddField(
            model_name='bankreconciliationline',
            name='batch',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name='lines', to='finance.bankstatementimportbatch'),
        ),
        migrations.AddConstraint(
            model_name='bankreconciliationline',
            constraint=models.UniqueConstraint(condition=models.Q(('batch__isnull', False), ('reference__gt', '')), fields=('bank_account','statement_date','reference','debit','credit'), name='uniq_bank_statement_ref_row'),
        ),
    ]
