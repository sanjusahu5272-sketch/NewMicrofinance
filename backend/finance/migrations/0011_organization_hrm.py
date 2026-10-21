from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion

class Migration(migrations.Migration):
    dependencies = [
        ('finance', '0010_staff_profile'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]
    operations = [
        migrations.CreateModel(name='OrganizationProfile', fields=[
            ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
            ('created_at', models.DateTimeField(auto_now_add=True)),
            ('updated_at', models.DateTimeField(auto_now=True)),
            ('name', models.CharField(default='NEW MICROFINANCE', max_length=180)),
            ('subtitle', models.CharField(blank=True, default='SERVICE ASSOCIATION', max_length=180)),
            ('address', models.TextField(blank=True)),
            ('phone', models.CharField(blank=True, max_length=30)),
            ('email', models.EmailField(blank=True, max_length=254)),
            ('website', models.URLField(blank=True)),
            ('registration_no', models.CharField(blank=True, max_length=100)),
            ('logo_data', models.TextField(blank=True, help_text='Validated data URL for a small logo; do not store customer documents here.')),
        ], options={'ordering': ['id']}),
        migrations.CreateModel(name='AttendanceRecord', fields=[
            ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
            ('created_at', models.DateTimeField(auto_now_add=True)), ('updated_at', models.DateTimeField(auto_now=True)),
            ('attendance_date', models.DateField()),
            ('status', models.CharField(choices=[('present','Present'),('absent','Absent'),('leave','Leave'),('half_day','Half day'),('holiday','Holiday')], default='present', max_length=20)),
            ('check_in', models.TimeField(blank=True, null=True)), ('check_out', models.TimeField(blank=True, null=True)),
            ('note', models.CharField(blank=True, max_length=255)),
            ('created_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, to=settings.AUTH_USER_MODEL)),
            ('employee', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='attendance_records', to='finance.employee')),
        ], options={'ordering': ['-attendance_date', 'employee__name']}),
        migrations.AddConstraint(model_name='attendancerecord', constraint=models.UniqueConstraint(fields=('employee','attendance_date'), name='uniq_employee_attendance_date')),
        migrations.CreateModel(name='PayrollRecord', fields=[
            ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
            ('created_at', models.DateTimeField(auto_now_add=True)), ('updated_at', models.DateTimeField(auto_now=True)),
            ('period_month', models.DateField(help_text='Use the first calendar day of the payroll month.')),
            ('basic_salary', models.DecimalField(decimal_places=2, default=0, max_digits=14)),
            ('fixed_allowance', models.DecimalField(decimal_places=2, default=0, max_digits=14)),
            ('fixed_deduction', models.DecimalField(decimal_places=2, default=0, max_digits=14)),
            ('income_tax', models.DecimalField(decimal_places=2, default=0, max_digits=14)),
            ('net_salary', models.DecimalField(decimal_places=2, default=0, max_digits=14)),
            ('status', models.CharField(choices=[('draft','Draft'),('approved','Approved'),('paid','Paid'),('cancelled','Cancelled')], default='draft', max_length=20)),
            ('paid_on', models.DateField(blank=True, null=True)), ('payment_reference', models.CharField(blank=True, max_length=120)),
            ('created_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, to=settings.AUTH_USER_MODEL)),
            ('employee', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='payroll_records', to='finance.employee')),
        ], options={'ordering': ['-period_month', 'employee__name']}),
        migrations.AddConstraint(model_name='payrollrecord', constraint=models.UniqueConstraint(fields=('employee','period_month'), name='uniq_employee_payroll_month')),
    ]
