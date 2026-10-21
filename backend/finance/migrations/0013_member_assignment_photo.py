from django.db import migrations, models
import django.db.models.deletion

class Migration(migrations.Migration):
    dependencies = [('finance', '0012_employee_hr_reference_fields')]
    operations = [
        migrations.AddField(
            model_name='member', name='branch_manager',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name='managed_members', to='finance.employee'),
        ),
        migrations.AddField(
            model_name='member', name='photo_data',
            field=models.TextField(blank=True, help_text='Small validated passport-size customer photo data URL.'),
        ),
    ]
