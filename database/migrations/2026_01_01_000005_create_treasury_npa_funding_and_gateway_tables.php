<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // 1. Add missing RBI DPD/SMA/NPA, Bounce, Idempotency & Audit Hash-Chain columns to core tables
        Schema::table('mfi_loan_plans', function (Blueprint $table): void {
            if (!Schema::hasColumn('mfi_loan_plans', 'max_penalty_cap_pct')) {
                $table->decimal('max_penalty_cap_pct', 8, 2)->default(25.00)->after('bounce_charge_amount');
            }
        });

        Schema::table('mfi_loans', function (Blueprint $table): void {
            if (!Schema::hasColumn('mfi_loans', 'dpd_days')) {
                $table->integer('dpd_days')->default(0)->index();
            }
            if (!Schema::hasColumn('mfi_loans', 'asset_class')) {
                $table->string('asset_class', 64)->default('STANDARD')->index();
            }
            if (!Schema::hasColumn('mfi_loans', 'npa_provision_amount')) {
                $table->decimal('npa_provision_amount', 18, 2)->default(0.00);
            }
            if (!Schema::hasColumn('mfi_loans', 'bounce_count')) {
                $table->integer('bounce_count')->default(0);
            }
            if (!Schema::hasColumn('mfi_loans', 'loan_close_date')) {
                $table->date('loan_close_date')->nullable();
            }
            if (!Schema::hasColumn('mfi_loans', 'idempotency_key')) {
                $table->string('idempotency_key', 128)->nullable()->unique();
            }
        });

        Schema::table('mfi_installments', function (Blueprint $table): void {
            if (!Schema::hasColumn('mfi_installments', 'dpd_days')) {
                $table->integer('dpd_days')->default(0)->index();
            }
            if (!Schema::hasColumn('mfi_installments', 'asset_class')) {
                $table->string('asset_class', 64)->default('STANDARD');
            }
            $table->unique(['loan_pk', 'emi_no'], 'mfi_installments_loan_pk_emi_no_key');
        });

        Schema::table('mfi_emi_collections', function (Blueprint $table): void {
            if (!Schema::hasColumn('mfi_emi_collections', 'instrument_date')) {
                $table->string('instrument_date', 32)->default('');
            }
            if (!Schema::hasColumn('mfi_emi_collections', 'bank_name')) {
                $table->string('bank_name', 120)->default('');
            }
            if (!Schema::hasColumn('mfi_emi_collections', 'bounced_at')) {
                $table->string('bounced_at', 64)->default('');
            }
            if (!Schema::hasColumn('mfi_emi_collections', 'bounce_reason')) {
                $table->string('bounce_reason')->default('');
            }
            if (!Schema::hasColumn('mfi_emi_collections', 'bounce_charge')) {
                $table->decimal('bounce_charge', 18, 2)->default(0.00);
            }
            if (!Schema::hasColumn('mfi_emi_collections', 'idempotency_key')) {
                $table->string('idempotency_key', 128)->nullable()->unique();
            }
        });

        Schema::table('mfi_audit_logs', function (Blueprint $table): void {
            if (!Schema::hasColumn('mfi_audit_logs', 'prev_hash')) {
                $table->string('prev_hash', 128)->default('');
            }
            if (!Schema::hasColumn('mfi_audit_logs', 'entry_hash')) {
                $table->string('entry_hash', 128)->default('')->index();
            }
        });

        // 2. Branch Subledger Balances (mfi_branch_ledger_balances)
        Schema::create('mfi_branch_ledger_balances', function (Blueprint $table): void {
            $table->id();
            $table->string('tenant_code', 64)->default('TNT-NEEV-01')->index();
            $table->string('branch_name', 120);
            $table->string('ledger_name', 160);
            $table->string('nature', 32)->default('ASSET');
            $table->decimal('opening_balance', 18, 2)->default(0.00);
            $table->decimal('current_debit', 18, 2)->default(0.00);
            $table->decimal('current_credit', 18, 2)->default(0.00);
            $table->decimal('closing_balance', 18, 2)->default(0.00);
            $table->timestamps();
            $table->unique(['tenant_code', 'branch_name', 'ledger_name'], 'mfi_branch_ledger_balances_unique');
        });

        // 3. Inter-Branch Fund Transfers (mfi_fund_transfers)
        Schema::create('mfi_fund_transfers', function (Blueprint $table): void {
            $table->id();
            $table->string('tenant_code', 64)->default('TNT-NEEV-01')->index();
            $table->string('transfer_no', 64)->unique();
            $table->date('transfer_date')->index();
            $table->string('from_branch', 120);
            $table->string('to_branch', 120);
            $table->string('ledger_name', 120)->default('BANK ACCOUNT');
            $table->decimal('amount', 18, 2);
            $table->string('voucher_out_no', 64)->default('');
            $table->string('voucher_in_no', 64)->default('');
            $table->string('approved_by', 64)->default('');
            $table->string('status', 32)->default('PENDING');
            $table->text('remark')->nullable();
            $table->timestamps();
        });

        // 4. Penalty Schemes (mfi_penalty_schemes)
        Schema::create('mfi_penalty_schemes', function (Blueprint $table): void {
            $table->id();
            $table->string('tenant_code', 64)->default('TNT-NEEV-01')->index();
            $table->string('name', 120)->unique();
            $table->string('penalty_type', 32)->default('FIXED'); // FIXED | PERCENTAGE
            $table->decimal('amount_or_pct', 18, 2)->default(50.00);
            $table->string('penalty_mode', 32)->default('ONE TIME'); // ONE TIME | DAILY
            $table->integer('grace_period_days')->default(3);
            $table->decimal('minimum_due_amount', 18, 2)->default(500.00);
            $table->string('status', 32)->default('ACTIVE');
            $table->timestamps();
        });

        // 5. Bank Accounts Master (mfi_bank_accounts)
        Schema::create('mfi_bank_accounts', function (Blueprint $table): void {
            $table->id();
            $table->string('tenant_code', 64)->default('TNT-NEEV-01')->index();
            $table->string('account_name', 160);
            $table->string('account_no', 64)->unique();
            $table->string('bank_name', 160);
            $table->string('branch_name', 120)->default('INDORE HEAD OFFICE');
            $table->string('ifsc_code', 32);
            $table->decimal('opening_balance', 18, 2)->default(0.00);
            $table->decimal('closing_balance', 18, 2)->default(0.00);
            $table->string('status', 32)->default('ACTIVE');
            $table->timestamps();
        });

        // 6. Loan Settlements (mfi_loan_settlements)
        Schema::create('mfi_loan_settlements', function (Blueprint $table): void {
            $table->id();
            $table->string('tenant_code', 64)->default('TNT-NEEV-01')->index();
            $table->string('settlement_no', 64)->unique();
            $table->unsignedBigInteger('loan_pk')->index();
            $table->string('loan_id', 64)->index();
            $table->string('member_code', 64)->index();
            $table->string('member_name', 160);
            $table->string('branch_name', 120);
            $table->decimal('settlement_amount', 18, 2);
            $table->decimal('pre_closing_charge', 18, 2)->default(0.00);
            $table->date('settlement_date');
            $table->string('pay_mode', 32)->default('CASH');
            $table->string('utr_no', 64)->default('');
            $table->string('reason', 160)->default('PRE-PAYMENT');
            $table->string('status', 32)->default('APPROVED');
            $table->string('idempotency_key', 128)->nullable()->unique();
            $table->timestamps();
        });

        // 7. Payment Gateway Orders, Webhooks, Refunds & Payouts
        Schema::create('mfi_payment_orders', function (Blueprint $table): void {
            $table->id();
            $table->string('tenant_code', 64)->default('TNT-NEEV-01')->index();
            $table->string('order_id', 64)->unique();
            $table->string('loan_id', 64)->index();
            $table->string('member_code', 64)->default('');
            $table->string('member_name', 160)->default('');
            $table->string('purpose', 64)->default('EMI_COLLECTION');
            $table->decimal('amount', 18, 2);
            $table->string('currency', 8)->default('INR');
            $table->string('provider', 64)->default('UPI_BANK_DIRECT');
            $table->string('status', 32)->default('CREATED');
            $table->string('utr_no', 64)->default('');
            $table->string('gateway_payment_id', 128)->default('');
            $table->string('receipt_no', 64)->default('');
            $table->string('created_by', 64)->default('ADM01');
            $table->string('verified_at', 64)->default('');
            $table->timestamps();
        });

        Schema::create('mfi_payment_webhooks', function (Blueprint $table): void {
            $table->id();
            $table->string('tenant_code', 64)->default('TNT-NEEV-01')->index();
            $table->string('event_id', 128)->unique();
            $table->string('provider', 64);
            $table->string('event_type', 64);
            $table->string('order_id', 64)->default('')->index();
            $table->string('payment_id', 128)->default('')->index();
            $table->string('utr_no', 64)->default('');
            $table->decimal('amount', 18, 2)->default(0.00);
            $table->text('payload_json');
            $table->string('status', 32)->default('VERIFIED');
            $table->timestamps();
        });

        Schema::create('mfi_payout_disbursements', function (Blueprint $table): void {
            $table->id();
            $table->string('tenant_code', 64)->default('TNT-NEEV-01')->index();
            $table->string('payout_ref', 64)->unique();
            $table->string('loan_id', 64)->index();
            $table->string('provider', 64)->default('RAZORPAYX PAYOUTS');
            $table->string('transfer_mode', 32)->default('IMPS');
            $table->decimal('amount', 18, 2);
            $table->string('utr_no', 64)->default('');
            $table->string('status', 32)->default('PROCESSED');
            $table->string('idempotency_key', 128)->nullable()->unique();
            $table->timestamps();
        });

        // 8. System Settings & Maker-Checker Voucher Approval Queue (from 0001 & 0002 SQL)
        Schema::create('mfi_system_settings', function (Blueprint $table): void {
            $table->id();
            $table->string('tenant_code', 64)->default('TNT-NEEV-01')->index();
            $table->string('key', 120);
            $table->text('value')->nullable();
            $table->string('status', 32)->default('ACTIVE');
            $table->timestamps();
            $table->unique(['tenant_code', 'key'], 'mfi_system_settings_tenant_key_unique');
        });

        Schema::create('mfi_voucher_approval_requests', function (Blueprint $table): void {
            $table->id();
            $table->string('tenant_code', 64)->default('TNT-NEEV-01')->index();
            $table->string('request_no', 64)->unique();
            $table->string('idempotency_key', 128)->unique();
            $table->string('maker_code', 64);
            $table->jsonb('voucher_payload_json');
            $table->string('status', 32)->default('PENDING_APPROVAL');
            $table->string('checker_code', 64)->default('');
            $table->string('voucher_no', 64)->default('');
            $table->string('approved_at', 64)->default('');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('mfi_voucher_approval_requests');
        Schema::dropIfExists('mfi_system_settings');
        Schema::dropIfExists('mfi_payout_disbursements');
        Schema::dropIfExists('mfi_payment_webhooks');
        Schema::dropIfExists('mfi_payment_orders');
        Schema::dropIfExists('mfi_loan_settlements');
        Schema::dropIfExists('mfi_bank_accounts');
        Schema::dropIfExists('mfi_penalty_schemes');
        Schema::dropIfExists('mfi_fund_transfers');
        Schema::dropIfExists('mfi_branch_ledger_balances');
    }
};
