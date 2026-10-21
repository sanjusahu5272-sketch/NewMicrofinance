from django.contrib import admin
from .models import *
for model in [Branch,Area,Centre,Group,Employee,Member,LoanProduct,LoanApplication,Loan,Installment,Disbursement,Payment,ProductLoanRequest,FundsTransferRequest,PayrollRecord,CapitalEntry,Expense,JournalEntry,AuditLog,ChartOfAccount,StaffProfile,HolidayCalendar,LoanTopUpRequest,DepositAccount,DepositCollection]: admin.site.register(model)

for model in [MasterCatalogEntry, PenaltyScheme, SoftwareTiming, FinancialSession, BusinessSettings, PenaltyAssessment]:
    try:
        admin.site.register(model)
    except admin.sites.AlreadyRegistered:
        pass

