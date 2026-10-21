from django.db import migrations, models

class Migration(migrations.Migration):
    dependencies = [('finance', '0013_member_assignment_photo')]
    operations = [migrations.CreateModel(
        name='ReferenceMaster',
        fields=[('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')), ('created_at', models.DateTimeField(auto_now_add=True)), ('updated_at', models.DateTimeField(auto_now=True)), ('kind', models.CharField(choices=[('identity_proof', 'Identity Proof'), ('relation', 'Relation'), ('purpose', 'Purpose'), ('reason', 'Reason')], max_length=30)), ('name', models.CharField(max_length=120)), ('active', models.BooleanField(default=True))],
        options={'ordering': ['kind', 'name']},
    ), migrations.AddConstraint(model_name='referencemaster', constraint=models.UniqueConstraint(fields=('kind', 'name'), name='uniq_reference_master_kind_name'))]
