from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion

class Migration(migrations.Migration):
    dependencies=[('finance','0003_integration_settings'),migrations.swappable_dependency(settings.AUTH_USER_MODEL)]
    operations=[migrations.CreateModel(name='KycDocument',fields=[
        ('id',models.BigAutoField(auto_created=True,primary_key=True,serialize=False,verbose_name='ID')),
        ('created_at',models.DateTimeField(auto_now_add=True)),('updated_at',models.DateTimeField(auto_now=True)),
        ('document_type',models.CharField(choices=[('photo','Member Photo'),('identity','Identity Proof'),('address','Address Proof'),('income','Income Proof'),('signature','Signature'),('other','Other')],max_length=20)),
        ('file',models.FileField(upload_to='private/kyc/%Y/%m/')),('original_name',models.CharField(max_length=255)),
        ('content_type',models.CharField(blank=True,max_length=100)),('size_bytes',models.PositiveBigIntegerField(default=0)),
        ('verified',models.BooleanField(default=False)),('verification_note',models.CharField(blank=True,max_length=255)),
        ('member',models.ForeignKey(on_delete=django.db.models.deletion.CASCADE,related_name='kyc_documents',to='finance.member')),
        ('uploaded_by',models.ForeignKey(blank=True,null=True,on_delete=django.db.models.deletion.PROTECT,to=settings.AUTH_USER_MODEL)),
    ],options={'ordering':['-created_at']})]
