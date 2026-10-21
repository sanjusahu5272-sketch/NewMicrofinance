from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [('finance', '0018_bank_account_tracking')]
    operations = [migrations.AddField(model_name='payment', name='bank_account', field=models.CharField(blank=True, default='', max_length=120))]
