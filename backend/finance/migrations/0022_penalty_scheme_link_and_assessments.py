# Generated for V68 Master-menu penalty scheme integration.
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [('finance', '0021_master_menu_configuration')]
    operations = [
        migrations.AddField(
            model_name='loanproduct', name='penalty_scheme',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name='loan_products', to='finance.penaltyscheme'),
        ),
        migrations.CreateModel(
            name='PenaltyAssessment',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('assessment_date', models.DateField()),
                ('assessment_key', models.CharField(max_length=160, unique=True)),
                ('source', models.CharField(choices=[('scheme', 'Configured Penalty Scheme'), ('legacy', 'Legacy Loan Plan Penalty')], max_length=12)),
                ('overdue_days', models.PositiveIntegerField(default=0)),
                ('overdue_amount', models.DecimalField(decimal_places=2, default=0, max_digits=14)),
                ('amount', models.DecimalField(decimal_places=2, max_digits=14)),
                ('installment', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='penalty_assessments', to='finance.installment')),
                ('scheme', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name='assessments', to='finance.penaltyscheme')),
            ],
            options={'ordering': ['-assessment_date', 'id']},
        ),
    ]
