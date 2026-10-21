from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion

class Migration(migrations.Migration):
    dependencies = [('finance','0007_bank_reconciliation_line'), migrations.swappable_dependency(settings.AUTH_USER_MODEL)]
    operations = [
        migrations.AddField(model_name='loanproduct', name='max_income_multiple', field=models.DecimalField(blank=True, decimal_places=2, max_digits=7, null=True)),
        migrations.AddField(model_name='loanapplication', name='created_by', field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name='loan_applications_created', to=settings.AUTH_USER_MODEL)),
        migrations.AddField(model_name='loanapplication', name='approved_by', field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name='loan_applications_approved', to=settings.AUTH_USER_MODEL)),
        migrations.AddField(model_name='loan', name='created_by', field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name='loans_created', to=settings.AUTH_USER_MODEL)),
        migrations.AddField(model_name='loan', name='approved_by', field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name='loans_approved', to=settings.AUTH_USER_MODEL)),
        migrations.AddField(model_name='loan', name='disbursed_by', field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name='loans_disbursed', to=settings.AUTH_USER_MODEL)),
    ]
