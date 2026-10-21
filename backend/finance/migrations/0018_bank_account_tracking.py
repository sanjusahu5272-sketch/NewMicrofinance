from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [('finance', '0017_payment_reversal_fields')]

    operations = [
        migrations.AddField(
            model_name='capitalentry',
            name='bank_account',
            field=models.CharField(blank=True, default='', max_length=120),
        ),
        migrations.AddField(
            model_name='disbursement',
            name='bank_account',
            field=models.CharField(blank=True, default='', max_length=120),
        ),
    ]
