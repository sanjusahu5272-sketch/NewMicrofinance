from decimal import Decimal
from datetime import date
from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient
from .models import BankStatementImportBatch, BankReconciliationLine, ChartOfAccount, AuditLog, JournalEntry
from django.core.files.uploadedfile import SimpleUploadedFile

class V149BankReconciliationTests(TestCase):
    def setUp(self):
        User=get_user_model()
        self.user=User.objects.create_user(username='v149-accountant',password='test-password-149',is_staff=True)
        self.client=APIClient(); self.client.force_authenticate(self.user)
        ChartOfAccount.objects.create(code='BANK-V149',name='V149 Test Bank',account_type='asset',active=True)

    def _csv(self,content=None,name='statement.csv'):
        content=content or ('statement_date,description,reference,debit,credit,statement_balance\n'
                            '2026-10-01,Collection,REC-149,0,100.00,1100.00\n'
                            '2026-10-02,Expense,EXP-149,25.00,0,1075.00\n')
        return SimpleUploadedFile(name,content.encode('utf-8'),content_type='text/csv')

    def _import(self,content=None,name='statement.csv',opening='1000.00',closing='1075.00'):
        return self.client.post('/api/bank-reconciliation-lines/import-csv/',{
            'file':self._csv(content,name),'bank_account':'V149 Test Bank',
            'opening_balance':opening,'closing_balance':closing,'statement_start':'2026-10-01','statement_end':'2026-10-31',
        },format='multipart')

    def test_csv_import_creates_batch_and_lines(self):
        response=self._import()
        self.assertEqual(response.status_code,201,response.data)
        batch=BankStatementImportBatch.objects.get(pk=response.data['id'])
        self.assertEqual(batch.row_count,2)
        self.assertEqual(batch.total_credit,Decimal('100.00'))
        self.assertEqual(batch.total_debit,Decimal('25.00'))
        self.assertEqual(batch.lines.count(),2)
        self.assertTrue(AuditLog.objects.filter(action='bank_statement_csv_imported',object_id=str(batch.pk)).exists())

    def test_exact_same_file_is_rejected(self):
        first=self._import()
        self.assertEqual(first.status_code,201,first.data)
        second=self._import()
        self.assertEqual(second.status_code,409,second.data)
        self.assertEqual(BankStatementImportBatch.objects.count(),1)

    def test_same_referenced_transaction_in_overlapping_file_is_rejected(self):
        first=self._import()
        self.assertEqual(first.status_code,201,first.data)
        overlap='date,description,reference,debit,credit\n2026-10-01,Collection,REC-149,0,100.00\n'
        second=self._import(content=overlap,name='overlap.csv',opening='1000',closing='1100')
        self.assertEqual(second.status_code,400,second.data)
        self.assertEqual(BankStatementImportBatch.objects.count(),1)

    def test_invalid_debit_credit_row_is_rejected_without_partial_import(self):
        content='date,debit,credit\n2026-10-01,10,10\n'
        response=self._import(content=content,name='invalid.csv',opening='100',closing='100')
        self.assertEqual(response.status_code,400,response.data)
        self.assertEqual(BankStatementImportBatch.objects.count(),0)
        self.assertEqual(BankReconciliationLine.objects.count(),0)

    def test_batch_cannot_close_with_unmatched_lines(self):
        response=self._import()
        batch_id=response.data['id']
        close=self.client.post(f'/api/bank-statement-batches/{batch_id}/reconcile/',{'note':'Statement independently reviewed'},format='json')
        self.assertEqual(close.status_code,409,close.data)
        self.assertEqual(BankStatementImportBatch.objects.get(pk=batch_id).status,'imported')

    def test_ignored_lines_do_not_count_as_reconciled(self):
        response=self._import()
        batch=BankStatementImportBatch.objects.get(pk=response.data['id'])
        batch.lines.update(status='ignored',reconciliation_note='Investigate bank fee')
        close=self.client.post(f'/api/bank-statement-batches/{batch.pk}/reconcile/',{'note':'Reviewed and approved'},format='json')
        self.assertEqual(close.status_code,409,close.data)
        self.assertEqual(BankStatementImportBatch.objects.get(pk=batch.pk).status,'imported')

    def test_batch_close_requires_balance_math_and_all_lines_resolved(self):
        response=self._import()
        batch=BankStatementImportBatch.objects.get(pk=response.data['id'])
        line1,line2=list(batch.lines.order_by('statement_date','id'))
        line1.status='matched'; line1.matched_journal_reference='REC-149'; line1.reconciliation_note='Matched to verified ledger reference'; line1.save()
        line2.status='matched'; line2.matched_journal_reference='EXP-149'; line2.reconciliation_note='Matched to verified ledger reference'; line2.save()
        batch.closing_balance=Decimal('1076.00'); batch.save(update_fields=['closing_balance'])
        bad=self.client.post(f'/api/bank-statement-batches/{batch.pk}/reconcile/',{'note':'Reviewed and approved'},format='json')
        self.assertEqual(bad.status_code,409,bad.data)
        batch.closing_balance=Decimal('1075.00'); batch.save(update_fields=['closing_balance'])
        JournalEntry.objects.create(date=date(2026,9,30),entry_type='adjustment',account='V149 Test Bank',debit=Decimal('1000.00'),credit=Decimal('0.00'),reference='OPEN-149')
        JournalEntry.objects.create(date=date(2026,10,1),entry_type='adjustment',account='V149 Test Bank',debit=Decimal('100.00'),credit=Decimal('0.00'),reference='REC-149')
        JournalEntry.objects.create(date=date(2026,10,2),entry_type='adjustment',account='V149 Test Bank',debit=Decimal('0.00'),credit=Decimal('25.00'),reference='EXP-149')
        good=self.client.post(f'/api/bank-statement-batches/{batch.pk}/reconcile/',{'note':'Reviewed and approved'},format='json')
        self.assertEqual(good.status_code,200,good.data)
        batch.refresh_from_db()
        self.assertEqual(batch.status,'reconciled')
        self.assertEqual(batch.reconciled_by_id,self.user.pk)
