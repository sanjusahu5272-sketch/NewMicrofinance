from django.db import migrations, models

class Migration(migrations.Migration):
    dependencies = [('finance', '0004_kyc_document')]
    operations = [
        migrations.AddField(
            model_name='payment',
            name='idempotency_key',
            field=models.CharField(blank=True, max_length=100, null=True, unique=True),
        ),
    ]
