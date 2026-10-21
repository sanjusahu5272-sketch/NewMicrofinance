import os
from decimal import Decimal
from django.core.management.base import BaseCommand
from django.contrib.auth.models import User
from django.utils import timezone
from finance.models import Branch,LoanProduct,Member,CapitalEntry,Loan

class Command(BaseCommand):
    help='Create explicitly requested demo data for non-production development only.'
    def handle(self,*args,**kwargs):
        if os.getenv('SEED_DEMO','0')!='1':
            self.stdout.write('SEED_DEMO disabled; no demo data created.')
            return
        from django.conf import settings
        if not settings.DEBUG:
            raise RuntimeError('seed_demo is disabled when DEBUG=0. Never seed demo credentials in production.')
        password=os.getenv('ADMIN_PASSWORD','')
        if len(password)<16 or password in {'Admin@12345','change-this-admin-password'}:
            raise RuntimeError('Set a unique ADMIN_PASSWORD of at least 16 characters before explicitly seeding demo data.')
        user,_=User.objects.get_or_create(username='admin',defaults={'is_staff':True,'is_superuser':True})
        user.is_staff=True; user.is_superuser=True; user.set_password(password); user.save()
        branch,_=Branch.objects.get_or_create(code='HO',defaults={'name':'Head Office','address':'Main Office','phone':''})
        LoanProduct.objects.get_or_create(code='MICRO-01',defaults={'name':'Micro Loan 01','interest_rate':Decimal('18'),'interest_method':'flat','frequency':'monthly','tenure':12,'processing_fee':Decimal('100'),'late_penalty':Decimal('50')})
        Member.objects.get_or_create(member_no='DEMO-001',defaults={'branch':branch,'name':'Demo Customer','phone':'9999999999','occupation':'Small Business','household_income':Decimal('25000')})
        if not CapitalEntry.objects.exists(): CapitalEntry.objects.create(kind='in',amount=Decimal('100000'),date=timezone.localdate(),note='Demo opening capital',created_by=user)
        self.stdout.write(self.style.SUCCESS('Demo seed completed. Use the ADMIN_PASSWORD you supplied.'))
