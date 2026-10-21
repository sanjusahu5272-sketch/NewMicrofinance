from django.conf import settings
from django.db import migrations, models

class Migration(migrations.Migration):
    dependencies=[('finance','0002_final_features'),migrations.swappable_dependency(settings.AUTH_USER_MODEL)]
    operations=[migrations.CreateModel(name='IntegrationSetting',fields=[('id',models.BigAutoField(auto_created=True,primary_key=True,serialize=False,verbose_name='ID')),('created_at',models.DateTimeField(auto_now_add=True)),('updated_at',models.DateTimeField(auto_now=True)),('provider',models.CharField(choices=[('razorpay','Razorpay'),('cashfree','Cashfree'),('upi','UPI / AutoPay'),('enach','eNACH / Mandate'),('sms','SMS Gateway'),('whatsapp','WhatsApp'),('smtp','Email / SMTP'),('storage','Object Storage')],max_length=30)),('key',models.CharField(max_length=80)),('encrypted_value',models.TextField(blank=True)),('enabled',models.BooleanField(default=False)),('updated_by',models.ForeignKey(blank=True,null=True,on_delete=models.SET_NULL,to=settings.AUTH_USER_MODEL))],options={'ordering':['provider','key']}),migrations.AddConstraint(model_name='integrationsetting',constraint=models.UniqueConstraint(fields=('provider','key'),name='uniq_integration_provider_key'))]
