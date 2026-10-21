from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion

class Migration(migrations.Migration):
    dependencies=[('finance','0006_chart_of_account'),migrations.swappable_dependency(settings.AUTH_USER_MODEL)]
    operations=[migrations.CreateModel(name='BankReconciliationLine',fields=[
        ('id',models.BigAutoField(auto_created=True,primary_key=True,serialize=False,verbose_name='ID')),
        ('created_at',models.DateTimeField(auto_now_add=True)),('updated_at',models.DateTimeField(auto_now=True)),
        ('bank_account',models.CharField(max_length=120)),('statement_date',models.DateField()),
        ('description',models.CharField(blank=True,max_length=255)),('reference',models.CharField(blank=True,max_length=120)),
        ('debit',models.DecimalField(decimal_places=2,default=0,max_digits=14)),('credit',models.DecimalField(decimal_places=2,default=0,max_digits=14)),
        ('statement_balance',models.DecimalField(blank=True,decimal_places=2,max_digits=14,null=True)),
        ('status',models.CharField(choices=[('unmatched','Unmatched'),('matched','Matched'),('ignored','Ignored')],default='unmatched',max_length=20)),
        ('matched_journal_reference',models.CharField(blank=True,max_length=120)),('reconciliation_note',models.TextField(blank=True)),
        ('created_by',models.ForeignKey(blank=True,null=True,on_delete=django.db.models.deletion.PROTECT,to=settings.AUTH_USER_MODEL)),
    ],options={'ordering':['statement_date','id']}),migrations.AddConstraint(model_name='bankreconciliationline',constraint=models.CheckConstraint(condition=models.Q(('debit__gte',0),('credit__gte',0)),name='bank_recon_nonnegative_amounts')),migrations.AddConstraint(model_name='bankreconciliationline',constraint=models.CheckConstraint(condition=~(models.Q(('debit__gt',0),('credit__gt',0))),name='bank_recon_one_side_only'))]
