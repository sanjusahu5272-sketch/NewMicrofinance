# Generated for V69 approval workflow integration.
from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import django.utils.timezone


class Migration(migrations.Migration):
    dependencies = [
        ('finance', '0022_penalty_scheme_link_and_assessments'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AlterField(
            model_name='payrollrecord',
            name='status',
            field=models.CharField(choices=[('draft', 'Draft'), ('approved', 'Approved'), ('rejected', 'Rejected'), ('paid', 'Paid'), ('cancelled', 'Cancelled')], default='draft', max_length=20),
        ),
        migrations.AddField(
            model_name='payrollrecord', name='approval_note', field=models.TextField(blank=True),
        ),
        migrations.AddField(
            model_name='payrollrecord', name='approved_by',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name='payroll_records_approved', to=settings.AUTH_USER_MODEL),
        ),
        migrations.AddField(
            model_name='payrollrecord', name='approved_at', field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AlterField(
            model_name='payment', name='status',
            field=models.CharField(choices=[('success', 'Success'), ('pending', 'Pending Approval'), ('failed', 'Failed'), ('rejected', 'Rejected'), ('refunded', 'Refunded')], default='success', max_length=20),
        ),
        migrations.AddField(
            model_name='payment', name='approval_note', field=models.TextField(blank=True),
        ),
        migrations.AddField(
            model_name='payment', name='approved_by',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name='payments_approved', to=settings.AUTH_USER_MODEL),
        ),
        migrations.AddField(
            model_name='payment', name='approved_at', field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='payment', name='created_by',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name='payments_created', to=settings.AUTH_USER_MODEL),
        ),
        migrations.CreateModel(
            name='ProductLoanRequest',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('product_name', models.CharField(max_length=160)),
                ('product_description', models.TextField(blank=True)),
                ('quantity', models.PositiveSmallIntegerField(default=1)),
                ('unit_price', models.DecimalField(decimal_places=2, max_digits=14)),
                ('down_payment', models.DecimalField(decimal_places=2, default=0, max_digits=14)),
                ('financed_amount', models.DecimalField(decimal_places=2, default=0, max_digits=14)),
                ('tenure_installments', models.PositiveSmallIntegerField(default=12)),
                ('purpose', models.TextField(blank=True)),
                ('status', models.CharField(choices=[('pending', 'Pending Approval'), ('approved', 'Approved'), ('rejected', 'Rejected'), ('cancelled', 'Cancelled')], default='pending', max_length=20)),
                ('approval_note', models.TextField(blank=True)),
                ('approved_at', models.DateTimeField(blank=True, null=True)),
                ('approved_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name='product_loan_requests_approved', to=settings.AUTH_USER_MODEL)),
                ('created_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name='product_loan_requests_created', to=settings.AUTH_USER_MODEL)),
                ('member', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='product_loan_requests', to='finance.member')),
            ],
            options={'ordering': ['-created_at', '-id']},
        ),
        migrations.CreateModel(
            name='FundsTransferRequest',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('date', models.DateField(default=django.utils.timezone.localdate)),
                ('from_account', models.CharField(max_length=120)),
                ('to_account', models.CharField(max_length=120)),
                ('amount', models.DecimalField(decimal_places=2, max_digits=14)),
                ('reference', models.CharField(blank=True, max_length=120)),
                ('note', models.TextField(blank=True)),
                ('status', models.CharField(choices=[('pending', 'Pending Approval'), ('approved', 'Approved'), ('rejected', 'Rejected')], default='pending', max_length=20)),
                ('approval_note', models.TextField(blank=True)),
                ('approved_at', models.DateTimeField(blank=True, null=True)),
                ('approved_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name='fund_transfer_requests_approved', to=settings.AUTH_USER_MODEL)),
                ('created_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name='fund_transfer_requests_created', to=settings.AUTH_USER_MODEL)),
            ],
            options={'ordering': ['-created_at', '-id']},
        ),
    ]
