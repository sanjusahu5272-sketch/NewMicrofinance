<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Services\CollectionsNpaService;
use App\Services\TreasuryReconciliationService;
use Illuminate\Console\Command;

/**
 * Automated Nightly General Ledger, Subledger, Audit Hash-Chain & RBI IRACP NPA Integrity Command.
 */
class AuditLedgerReconciliationCommand extends Command
{
    protected $signature = 'mfi:audit-ledger-reconciliation {--branch= : Optional branch filter} {--run-eod-npa : Persist RBI DPD/SMA/NPA classification and provisioning}';
    protected $description = 'Verify Trial Balance (Dr == Cr), Balance Sheet, Loan Subledger vs GL Receivable, Treasury Sufficiency, and Audit SHA-256 Chain';

    public function handle(
        TreasuryReconciliationService $treasuryService,
        CollectionsNpaService $collectionsNpaService
    ): int {
        $branch = $this->option('branch') ? (string) $this->option('branch') : null;

        if ($this->option('run-eod-npa')) {
            $collectionsNpaService->assessOverduePenaltiesDecimal();
            $npaSummary = $collectionsNpaService->classifyPortfolioDpdSmaNpa(
                asOfDate: date('Y-m-d'),
                branchName: $branch,
                persist: true,
                postProvisionVoucher: true
            );
            $this->info("EOD RBI NPA Classification Complete: Active Loans={$npaSummary['total_active_loans']}, GNPA={$npaSummary['gnpa_ratio_pct']}%, Required Provision=₹{$npaSummary['total_required_provision']}");
        }

        $recon = $treasuryService->buildSubledgerGlReconciliation($branch);

        $this->info('==============================================================================');
        $this->info('NEEV 4D — DOUBLE-ENTRY GL & SUBLEDGER RECONCILIATION REPORT');
        $this->info('==============================================================================');
        $this->line("  Status                        : {$recon['status']}");
        $this->line('  Trial Balance Balanced        : ' . ($recon['trial_balance_balanced'] ? 'YES' : 'NO'));
        $this->line('  Balance Sheet Balanced        : ' . ($recon['balance_sheet_balanced'] ? 'YES' : 'NO'));
        $this->line("  Subledger Principal Out.      : ₹{$recon['subledger_principal_outstanding']}");
        $this->line("  GL Loan Portfolio Receivable  : ₹{$recon['gl_loan_portfolio_receivable']}");
        $this->line("  Portfolio Variance            : ₹{$recon['variance']}");
        $this->line("  Schedule Mismatches Count     : {$recon['schedule_mismatches_count']}");
        $this->line('  Negative Treasury Drawers     : ' . count($recon['negative_treasury_drawers']));
        $this->line('  Audit SHA-256 Chain Verified  : ' . ($recon['audit_hash_chain_verified'] ? 'YES' : 'NO'));

        return $recon['is_reconciled'] ? self::SUCCESS : self::FAILURE;
    }
}
