from django.core.management.base import BaseCommand
from django.db.models import Count, Sum
from finance.models import JournalEntry


class Command(BaseCommand):
    help = 'Read-only report of journal account names that are not linked to a Chart of Accounts entry.'

    def add_arguments(self, parser):
        parser.add_argument('--limit', type=int, default=200)

    def handle(self, *args, **options):
        limit=max(1,min(options['limit'],5000))
        rows=(JournalEntry.objects.filter(account_ref__isnull=True)
              .values('account').annotate(lines=Count('id'),debit=Sum('debit'),credit=Sum('credit'))
              .order_by('account'))
        total=rows.count()
        self.stdout.write(self.style.WARNING('UNMAPPED JOURNAL ACCOUNTS (READ ONLY; no records changed)'))
        self.stdout.write(f'Unmapped account-name groups: {total}')
        shown=0
        for row in rows[:limit]:
            shown+=1
            self.stdout.write(f"- {row['account']!r}: lines={row['lines']}, debit={row['debit'] or 0}, credit={row['credit'] or 0}")
        if total>shown:
            self.stdout.write(f'... {total-shown} additional account-name groups omitted; rerun with --limit.')
        self.stdout.write('Map only after finance review. Do not bulk-assign based on fuzzy name matching.')
