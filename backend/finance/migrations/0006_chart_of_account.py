from django.db import migrations, models

class Migration(migrations.Migration):
    dependencies = [('finance', '0005_payment_idempotency_key')]
    operations = [migrations.CreateModel(name='ChartOfAccount', fields=[
        ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
        ('created_at', models.DateTimeField(auto_now_add=True)),
        ('updated_at', models.DateTimeField(auto_now=True)),
        ('code', models.CharField(max_length=30, unique=True)),
        ('name', models.CharField(max_length=120, unique=True)),
        ('account_type', models.CharField(choices=[('asset','Asset'),('liability','Liability'),('equity','Equity'),('income','Income'),('expense','Expense')], max_length=20)),
        ('active', models.BooleanField(default=True)),
        ('description', models.CharField(blank=True, max_length=255)),
    ], options={'ordering':['code']} )]
