# Additive migration: legacy journal rows stay unassigned rather than guessing a branch.
from django.db import migrations, models
import django.db.models.deletion

class Migration(migrations.Migration):
    dependencies = [('finance', '0026_topup_deposits_holidays')]
    operations = [
        migrations.AddField(
            model_name='journalentry', name='branch',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name='journal_entries', to='finance.branch'),
        ),
        migrations.AddField(
            model_name='capitalentry', name='branch',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name='capital_entries', to='finance.branch'),
        ),
        migrations.AddField(
            model_name='fundstransferrequest', name='from_branch',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name='outgoing_fund_transfers', to='finance.branch'),
        ),
        migrations.AddField(
            model_name='fundstransferrequest', name='to_branch',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name='incoming_fund_transfers', to='finance.branch'),
        ),
    ]
