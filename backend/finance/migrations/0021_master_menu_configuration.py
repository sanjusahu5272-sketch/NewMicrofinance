# Generated for V68 master-menu configuration foundation.
import datetime
from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ('finance', '0020_promise_to_pay_settlement'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name='member',
            name='state',
            field=models.CharField(blank=True, default='', max_length=100),
        ),
        migrations.AlterField(
            model_name='kycdocument',
            name='document_type',
            field=models.CharField(max_length=40),
        ),
        migrations.AlterField(
            model_name='payment',
            name='method',
            field=models.CharField(choices=[('cash', 'Cash'), ('upi', 'UPI'), ('bank', 'Bank'), ('card', 'Card'), ('gateway', 'Gateway')], max_length=40),
        ),
        migrations.CreateModel(
            name='MasterCatalogEntry',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('master_key', models.CharField(choices=[('state', 'State'), ('bank', 'Bank'), ('leave_type', 'Leave Type'), ('document_type', 'Document Type'), ('collection_mode', 'Collection Mode')], max_length=30)),
                ('name', models.CharField(max_length=120)),
                ('code', models.SlugField(max_length=40)),
                ('short_name', models.CharField(blank=True, max_length=40)),
                ('document_role', models.CharField(choices=[('other', 'Other'), ('identity', 'Identity Proof'), ('address', 'Address Proof')], default='other', max_length=20)),
                ('ledger_account', models.CharField(blank=True, default='', max_length=40)),
                ('active', models.BooleanField(default=True)),
                ('notes', models.CharField(blank=True, max_length=255)),
            ],
            options={'ordering': ['master_key', 'name'], 'constraints': [models.UniqueConstraint(fields=('master_key', 'code'), name='uniq_catalog_key_code')]},
        ),
        migrations.CreateModel(
            name='PenaltyScheme',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('name', models.CharField(max_length=120, unique=True)),
                ('grace_period_days', models.PositiveSmallIntegerField(default=0)),
                ('penalty_type', models.CharField(choices=[('fixed', 'Fixed'), ('percentage', 'Percentage')], default='fixed', max_length=20)),
                ('penalty_value', models.DecimalField(decimal_places=2, default=0, max_digits=12)),
                ('minimum_due_amount', models.DecimalField(decimal_places=2, default=0, max_digits=14)),
                ('penalty_mode', models.CharField(choices=[('one_time', 'One Time'), ('daily', 'Daily')], default='one_time', max_length=20)),
                ('recurring', models.BooleanField(default=False)),
                ('active', models.BooleanField(default=True)),
            ],
            options={'ordering': ['name']},
        ),
        migrations.CreateModel(
            name='SoftwareTiming',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('name', models.CharField(default='Default Working Hours', max_length=80, unique=True)),
                ('office_start', models.TimeField(default=datetime.time(9, 0))),
                ('office_end', models.TimeField(default=datetime.time(18, 0))),
                ('timezone_name', models.CharField(default='Asia/Kolkata', max_length=80)),
                ('auto_logout_minutes', models.PositiveSmallIntegerField(default=0, help_text='0 disables automatic logout.')),
                ('working_days', models.JSONField(blank=True, default=list)),
                ('active', models.BooleanField(default=True)),
            ],
            options={'ordering': ['name']},
        ),
        migrations.CreateModel(
            name='FinancialSession',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('name', models.CharField(max_length=40, unique=True)),
                ('start_date', models.DateField()),
                ('end_date', models.DateField()),
                ('active', models.BooleanField(default=True)),
            ],
            options={'ordering': ['-start_date', 'name']},
        ),
        migrations.CreateModel(
            name='BusinessSettings',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('key', models.CharField(default='default', max_length=30, unique=True)),
                ('values', models.JSONField(blank=True, default=dict)),
                ('updated_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, to=settings.AUTH_USER_MODEL)),
            ],
            options={'ordering': ['key']},
        ),
    ]
