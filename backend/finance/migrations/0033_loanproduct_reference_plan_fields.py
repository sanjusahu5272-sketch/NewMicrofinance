from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [('finance', '0032_bank_statement_import_batches')]
    operations = [
        migrations.AddField(model_name='loanproduct', name='plan_amount', field=models.DecimalField(decimal_places=2, default=0, max_digits=14)),
        migrations.AddField(model_name='loanproduct', name='paid_amount', field=models.DecimalField(decimal_places=2, default=0, max_digits=14)),
        migrations.AddField(model_name='loanproduct', name='recovery_type', field=models.CharField(choices=[('daily', 'Daily'), ('weekly', 'Weekly'), ('monthly', 'Monthly')], default='monthly', max_length=20)),
        migrations.AddField(model_name='loanproduct', name='holiday_exclude', field=models.BooleanField(default=False)),
        migrations.AddField(model_name='loanproduct', name='gst_charge_include', field=models.BooleanField(default=False)),
        migrations.AddField(model_name='loanproduct', name='file_charge_include', field=models.BooleanField(default=False)),
        migrations.AddField(model_name='loanproduct', name='file_charge', field=models.DecimalField(decimal_places=2, default=0, max_digits=12)),
        migrations.AddField(model_name='loanproduct', name='processing_fee_charge_include', field=models.BooleanField(default=False)),
        migrations.AddField(model_name='loanproduct', name='processing_fee_percentage', field=models.DecimalField(decimal_places=3, default=0, max_digits=7)),
        migrations.AddField(model_name='loanproduct', name='insurance_fee_charge_include', field=models.BooleanField(default=False)),
        migrations.AddField(model_name='loanproduct', name='insurance_fee_type', field=models.CharField(choices=[('fixed', 'Fixed'), ('percentage', 'Percentage')], default='fixed', max_length=20)),
        migrations.AddField(model_name='loanproduct', name='insurance_fee_amount', field=models.DecimalField(decimal_places=2, default=0, max_digits=12)),
        migrations.AddField(model_name='loanproduct', name='advance_installment', field=models.PositiveIntegerField(default=0)),
    ]
