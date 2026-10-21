from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion

class Migration(migrations.Migration):
    dependencies = [
        ('finance', '0016_alter_installment_options_alter_capitalentry_date_and_more'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]
    operations = [
        migrations.AddField(model_name='payment', name='is_reversed', field=models.BooleanField(default=False)),
        migrations.AddField(model_name='payment', name='reversed_at', field=models.DateTimeField(blank=True, null=True)),
        migrations.AddField(model_name='payment', name='reversed_by', field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name='payments_reversed', to=settings.AUTH_USER_MODEL)),
        migrations.AddField(model_name='payment', name='reversal_reason', field=models.TextField(blank=True)),
    ]
