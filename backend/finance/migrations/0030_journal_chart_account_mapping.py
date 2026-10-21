"""Add a safe Chart of Accounts foreign-key mapping for journal lines.

Existing journal text is retained. Backfill only a unique, case-insensitive exact
name match; ambiguous and unmatched entries stay NULL for manual reconciliation.
"""
from django.db import migrations, models
import django.db.models.deletion


def map_exact_accounts(apps, schema_editor):
    JournalEntry = apps.get_model('finance', 'JournalEntry')
    ChartOfAccount = apps.get_model('finance', 'ChartOfAccount')
    db = schema_editor.connection.alias
    for row in JournalEntry.objects.using(db).only('id', 'account').iterator(chunk_size=500):
        matches = list(ChartOfAccount.objects.using(db).filter(name__iexact=(row.account or '').strip(), active=True).values_list('id', flat=True)[:2])
        if len(matches) == 1:
            JournalEntry.objects.using(db).filter(pk=row.pk).update(account_ref_id=matches[0])


class Migration(migrations.Migration):
    dependencies = [('finance', '0029_v146_operational_safety')]
    operations = [
        migrations.AddField(
            model_name='journalentry', name='account_ref',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name='journal_entries', to='finance.chartofaccount'),
        ),
        migrations.RunPython(map_exact_accounts, migrations.RunPython.noop),
    ]
