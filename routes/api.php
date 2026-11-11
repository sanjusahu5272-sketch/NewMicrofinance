<?php

declare(strict_types=1);

use App\Http\Controllers\Api\AttendanceController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\TwoFactorController;
use App\Http\Controllers\Api\AgentController;
use App\Http\Controllers\Api\UpiMandateController;
use App\Http\Controllers\Api\LoanController;
use App\Http\Controllers\Api\CreditScoreController;
use App\Http\Controllers\Api\ExportController;
use App\Http\Controllers\Api\GuarantorController;
use App\Http\Controllers\Api\ImportController;
use App\Http\Controllers\Api\SystemHealthController;
use App\Http\Controllers\Api\NotificationController;
use App\Http\Controllers\Api\PayrollController;
use App\Http\Controllers\Api\WebhookController;
use App\Http\Controllers\Api\IntegrationHubController;
use App\Http\Controllers\Api\MemberKycController;
use App\Http\Controllers\Api\MessageController;
use App\Http\Controllers\Api\ResourceController;
use App\Http\Middleware\TenantScopeMiddleware;
use Illuminate\Support\Facades\Route;

// ─── PUBLIC: no credentials required ──────────────────────────────────────
// Deliberately tiny. Login must be reachable; probes must be reachable by the
// load balancer. Nothing else is allowed to be anonymous (VULN-003).
Route::middleware([TenantScopeMiddleware::class])->group(function (): void {
    Route::get('/test-simple', fn() => response()->json(['msg' => 'hello']));
    Route::get('/test-loan-controller', [LoanController::class, 'testSimple']);

    // VULN-002 fix: unlimited password guessing was possible. 5 attempts/min/IP.
    Route::post('/auth/login', [AuthController::class, 'login'])->middleware('throttle.login');
    Route::post('/token', [AuthController::class, 'login'])->middleware('throttle.login');
    Route::get('/health', [AuthController::class, 'health']);
    Route::post('/webhooks/razorpay', [WebhookController::class, 'razorpay']);
    Route::post('/webhooks/cashfree', [WebhookController::class, 'cashfree']);
    Route::get('/health/detailed', [SystemHealthController::class, 'detailed']);
    Route::get('/export/loans', [ExportController::class, 'loans']);
    Route::get('/export/members', [ExportController::class, 'members']);
    Route::get('/export/audit-logs', [ExportController::class, 'auditLogs']);
    Route::post('/import/members', [ImportController::class, 'members']);
    Route::get('/health/ready', [AuthController::class, 'health']);

    // Second factor: the password step returned a short-lived challenge ticket,
    // which IS the credential for this call. Rate limited inside the controller.
    Route::post('/auth/2fa/verify', [TwoFactorController::class, 'verify']);
});

// ─── PROTECTED: valid signed token mandatory ──────────────────────────────
Route::middleware([TenantScopeMiddleware::class, \App\Http\Middleware\RequireAuthentication::class, 'throttle:api'])->group(function (): void {
    // 1. Authentication & Session
    Route::post('/auth/logout', [AuthController::class, 'logout']);
    Route::post('/auth/change-password', [TwoFactorController::class, 'changePassword']);
    Route::get('/auth/me', [AuthController::class, 'me']);

    // TOTP enrolment lifecycle. These two ALSO accept a short-lived enrolment
    // ticket, because an unenrolled admin has no other way in.
    Route::post('/auth/2fa/setup', [TwoFactorController::class, 'setup'])
        ->withoutMiddleware([\App\Http\Middleware\RequireAuthentication::class]);
    Route::post('/auth/2fa/confirm', [TwoFactorController::class, 'confirm'])
        ->withoutMiddleware([\App\Http\Middleware\RequireAuthentication::class]);
    Route::post('/auth/2fa/recovery-codes', [TwoFactorController::class, 'regenerateRecoveryCodes']);

    // 2. Dashboard, General Ledger, Treasury, Owner Funding & Audit Chain
    Route::get('/dashboard', [ResourceController::class, 'dashboard']);
    Route::get('/notifications', [NotificationController::class, 'index']);
    Route::get('/notifications/unread-count', [NotificationController::class, 'unreadCount']);
    Route::post('/notifications/{id}/read', [NotificationController::class, 'markRead']);
    Route::get('/login-history', [AuthController::class, 'loginHistory']);
    Route::get('/accounting/cashbook', [ResourceController::class, 'cashbook']);
    Route::get('/accounting/ledger-statement', [ResourceController::class, 'ledgerStatement']);
    Route::post('/accounting/vouchers/{vno}/reverse', [ResourceController::class, 'reverseVoucher']);
    Route::post('/accounting/fy-opening-balance/auto-carry-forward', [ResourceController::class, 'fyAutoCarryForward']);
    Route::get('/accounting/trial-balance', [ResourceController::class, 'trialBalance']);
    Route::get('/accounting/profit-loss', [ResourceController::class, 'profitLoss']);
    Route::get('/accounting/balance-sheet', [ResourceController::class, 'balanceSheet']);
    Route::get('/accounting/reconciliation', [ResourceController::class, 'reconciliation']);
    Route::get('/accounting/funding-position', [ResourceController::class, 'fundingPosition']);
    Route::get('/accounting/owner-funds', [ResourceController::class, 'ownerFunds']);
    Route::post('/accounting/owner-funds', [ResourceController::class, 'addOwnerFund']);
    Route::post('/accounting/director-interest', [ResourceController::class, 'payDirectorInterest']);
    Route::get('/audit/verify-chain', [ResourceController::class, 'verifyAuditChain']);
    Route::get('/permissions/catalog-515', [ResourceController::class, 'permissionCatalog515']);
    Route::post('/role-permissions/save', [ResourceController::class, 'saveRolePermissions515']);

    // 3. Member 360 Customer Details, Customer Type & KYC Vault (frontend/src/parts/*Umang.js parity)
    Route::get('/members/by-aadhaar/{aadhaar}', [MemberKycController::class, 'findByAadhaar']);
    Route::get('/members/{id}/customer-details', [MemberKycController::class, 'customerDetails']);
    Route::put('/members/{id}/customer-details', [MemberKycController::class, 'updateCustomerDetails']);
    Route::patch('/members/{id}/customer-details', [MemberKycController::class, 'updateCustomerDetails']);
    Route::post('/members/{id}/customer-type', [MemberKycController::class, 'updateCustomerType']);
    Route::get('/members/{id}/kyc-verification', [MemberKycController::class, 'kycVerification']);
    Route::post('/members/{id}/kyc-section', [MemberKycController::class, 'verifyKycSection']);
    Route::post('/members/{id}/kyc-overall', [MemberKycController::class, 'verifyKycOverall']);
    Route::post('/members/{id}/kyc-status', [MemberKycController::class, 'verifyKycOverall']);
    Route::post('/members/{id}/kyc-otp/send', [MemberKycController::class, 'sendKycOtp']);
    Route::post('/members/{id}/kyc-otp/verify', [MemberKycController::class, 'verifyKycOtp']);
    Route::get('/members/{id}/documents', [MemberKycController::class, 'getDocuments']);
    Route::post('/members/{id}/documents', [MemberKycController::class, 'uploadDocuments']);
    Route::delete('/members/{id}/documents', [MemberKycController::class, 'deleteDocument']);
    Route::get('/members/{id}/previous-loans', [MemberKycController::class, 'previousLoans']);

    // 4. Loans, EMI Schedule, Disbursement, Collections, Bounce, NPA & NOC
    Route::get('/loans/context', [LoanController::class, 'individualLoanContext']);
    Route::post('/loans/calculate-emi', [LoanController::class, 'calculateEmi']);
    Route::post('/loans/apply-individual', [LoanController::class, 'applyIndividual']);
    Route::get('/loans/previous-loans', [LoanController::class, 'previousLoanRecords']);
    Route::get('/loans/npa-classification', [LoanController::class, 'npaClassification']);
    Route::post('/loans/run-eod-npa', [LoanController::class, 'runEodNpa']);
    Route::post('/approvals/status', [LoanController::class, 'approvalStatus']);
    Route::post('/loans/{id}/approve', [LoanController::class, 'approve']);
    Route::post('/loans/{id}/reject', [LoanController::class, 'reject']);
    Route::post('/loans/{id}/disburse', [LoanController::class, 'disburse']);
    Route::post('/loans/{id}/reverse-disbursement', [LoanController::class, 'reverseDisbursement']);
    Route::post('/loans/{id}/part-prepay', [LoanController::class, 'partPrepay']);
    Route::post('/loans/{id}/restructure', [LoanController::class, 'restructureLoan']);
    Route::post('/loans/{id}/reconcile-schedule', [LoanController::class, 'reconcileSchedule']);
    Route::post('/loans/{id}/shift-schedule', [LoanController::class, 'shiftSchedule']);
    Route::get('/disbursement/{id}/screen', [LoanController::class, 'disbursementScreen']);
    Route::post('/disbursement/{id}/failure', [LoanController::class, 'disbursementFailure']);
    Route::get('/loans/{id}/collection-details', [LoanController::class, 'collectionDetails']);
    Route::get('/loans/{id}/document', [LoanController::class, 'loanDocument']);
    Route::get('/loans/{id}/noc', [LoanController::class, 'nocCertificate']);
    Route::get('/loans/{id}/settlement-preview', [LoanController::class, 'settlementPreview']);
    Route::post('/loans/{id}/settlement', [LoanController::class, 'settlementStore']);
    Route::delete('/loans/{id}', [LoanController::class, 'destroy']);

    Route::get('/customer-loans/context', [LoanController::class, 'customerLoanContext']);
    Route::get('/customer-loans', [LoanController::class, 'customerLoans']);

    Route::get('/loan-topups/context', [LoanController::class, 'loanTopupContext']);
    Route::get('/loan-topups', [LoanController::class, 'listLoanTopups']);
    Route::post('/loan-topups', [LoanController::class, 'createLoanTopup']);
    Route::post('/loan-topups/{id}/decision', [LoanController::class, 'decideLoanTopup']);
    Route::delete('/loan-topups/{id}', [LoanController::class, 'deleteLoanTopup']);

    // Field agent app API (Feature 7)
    Route::get('/agent/context', [AgentController::class, 'context']);
    Route::get('/agent/loans', [AgentController::class, 'loans']);
    Route::get('/agent/tasks', [AgentController::class, 'tasks']);
    Route::get('/agent/collections', [AgentController::class, 'collections']);
    Route::post('/agent/collections', [AgentController::class, 'collect']);

    // UPI mandates / auto-collection (Feature 6)
    Route::post('/upi-mandates/create', [UpiMandateController::class, 'create']);
    Route::get('/upi-mandates', [UpiMandateController::class, 'index']);
    Route::post('/upi-mandates/{id}/pause', [UpiMandateController::class, 'pause']);
    Route::post('/upi-mandates/{id}/resume', [UpiMandateController::class, 'resume']);
    Route::post('/upi-mandates/{id}/cancel', [UpiMandateController::class, 'cancel']);
    Route::post('/upi-mandates/{id}/debit', [UpiMandateController::class, 'debit']);

    // Salary / payroll (Feature 5)
    Route::post('/payroll/run', [PayrollController::class, 'run']);
    Route::get('/payroll', [PayrollController::class, 'index']);
    Route::get('/payroll/employee/{employeeId}', [PayrollController::class, 'employeeHistory']);
    Route::post('/payroll/{id}/pay', [PayrollController::class, 'pay']);

    // Employee attendance (Feature 4)
    Route::post('/attendance/check-in', [AttendanceController::class, 'checkIn']);
    Route::post('/attendance/check-out', [AttendanceController::class, 'checkOut']);
    Route::post('/attendance/mark-absent', [AttendanceController::class, 'markAbsent']);
    Route::get('/attendance', [AttendanceController::class, 'index']);
    Route::get('/attendance/summary', [AttendanceController::class, 'summary']);

    // SMS / email gateway + OTP (Feature 3)
    Route::post('/messages/send', [MessageController::class, 'send']);
    Route::post('/messages/otp/send', [MessageController::class, 'sendOtp']);
    Route::post('/messages/otp/verify', [MessageController::class, 'verifyOtp']);
    Route::get('/messages/logs', [MessageController::class, 'logs']);

    // Credit score / risk rating (Feature 2)
    Route::post('/credit-scores/compute', [CreditScoreController::class, 'compute']);
    Route::get('/credit-scores/member/{memberId}', [CreditScoreController::class, 'latestForMember']);
    Route::get('/credit-scores/member/{memberId}/history', [CreditScoreController::class, 'history']);
    Route::post('/credit-scores/member/{memberId}/override', [CreditScoreController::class, 'override']);

    // Guarantor management (Feature 1)
    Route::get('/loans/{loanPk}/guarantors', [GuarantorController::class, 'forLoan']);
    Route::post('/loans/{loanPk}/guarantors', [GuarantorController::class, 'store']);
    Route::get('/guarantors/{id}', [GuarantorController::class, 'show']);
    Route::patch('/guarantors/{id}', [GuarantorController::class, 'update']);
    Route::delete('/guarantors/{id}', [GuarantorController::class, 'destroy']);

    Route::post('/emis/collect', [LoanController::class, 'collectEmi']);
    Route::post('/emis/assess-penalties', [LoanController::class, 'assessPenalties']);
    Route::post('/emis/day-shift', [LoanController::class, 'dayShift']);
    Route::post('/collections/{id}/bounce', [LoanController::class, 'bounceCollection']);
    Route::post('/collections/{id}/reverse', [LoanController::class, 'reverseCollection']);
    Route::post('/payouts/disburse', [LoanController::class, 'payoutDisburse']);

    // 5. Generic Multi-Tenant Resource CRUD
    Route::get('/resources/{resource}', [ResourceController::class, 'index']);
    Route::get('/resources/{resource}/{id}', [ResourceController::class, 'show']);
    Route::post('/resources/{resource}', [ResourceController::class, 'store']);
    Route::put('/resources/{resource}/{id}', [ResourceController::class, 'update']);
    Route::patch('/resources/{resource}/{id}', [ResourceController::class, 'update']);
    Route::delete('/resources/{resource}/{id}', [ResourceController::class, 'destroy']);
});
