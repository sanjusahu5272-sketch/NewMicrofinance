from django.db import migrations, models

class Migration(migrations.Migration):
    dependencies = [('finance', '0014_reference_master')]
    operations = [
        migrations.AlterField(
            model_name='referencemaster',
            name='kind',
            field=models.CharField(choices=[('identity_proof', 'Identity Proof'), ('relation', 'Relation'), ('purpose', 'Purpose'), ('reason', 'Reason'), ('designation', 'Designation')], max_length=30),
        ),
    ]
