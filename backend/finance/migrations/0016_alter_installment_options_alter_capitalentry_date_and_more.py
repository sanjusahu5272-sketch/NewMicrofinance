# Generated for the model-state changes present in V45.
# This migration only changes Django model metadata/defaults; it does not delete
# or rewrite existing loan/payment/accounting rows.
from django.db import migrations, models
import django.utils.timezone


class Migration(migrations.Migration):
    dependencies = [
        ('finance', '0015_reference_master_designation'),
    ]

    operations = [
        migrations.AlterModelOptions(
            name='installment',
            options={'ordering': ['loan_id', 'number']},
        ),
        migrations.AlterField(
            model_name='capitalentry',
            name='date',
            field=models.DateField(default=django.utils.timezone.localdate),
        ),
        migrations.AlterField(
            model_name='disbursement',
            name='date',
            field=models.DateField(default=django.utils.timezone.localdate),
        ),
        migrations.AlterField(
            model_name='expense',
            name='date',
            field=models.DateField(default=django.utils.timezone.localdate),
        ),
        migrations.AlterField(
            model_name='journalentry',
            name='date',
            field=models.DateField(default=django.utils.timezone.localdate),
        ),
        migrations.AlterField(
            model_name='payment',
            name='paid_on',
            field=models.DateField(default=django.utils.timezone.localdate),
        ),
    ]
