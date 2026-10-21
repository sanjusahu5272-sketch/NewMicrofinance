from django.db import migrations, models

class Migration(migrations.Migration):
    dependencies = [('finance', '0024_custom_roles')]
    operations = [
        migrations.CreateModel(
            name='SeriesConfiguration',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('key', models.CharField(max_length=40, unique=True)),
                ('label', models.CharField(max_length=100)),
                ('prefix', models.CharField(blank=True, default='', max_length=20)),
                ('next_number', models.PositiveBigIntegerField(default=1)),
                ('include_branch_code', models.BooleanField(default=False)),
                ('include_financial_year', models.BooleanField(default=False)),
            ],
            options={'ordering': ['id']},
        ),
    ]
