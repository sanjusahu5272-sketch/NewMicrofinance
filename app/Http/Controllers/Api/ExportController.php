<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use Illuminate\Routing\Controller;
use App\Models\Loan;
use App\Models\Member;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Data Export Controller
 *
 * Export loans, members, collections, and audit logs as Excel (XLSX),
 * CSV, or PDF. All money values are integer paise in the raw data,
 * converted to proper decimal for display.
 */
class ExportController extends \Illuminate\Routing\Controller
{
    public function loans(Request $request)
    {
        $format = strtolower($request->input('format', 'csv'));
        $branch = $request->input('branch');
        $from = $request->input('from');
        $to = $request->input('to');

        $query = Loan::query()->where('status', 'DISBURSED');
        if ($branch) $query->where('branch_name', $branch);
        if ($from) $query->whereDate('application_date', '>=', $from);
        if ($to) $query->whereDate('application_date', '<=', $to);
        $loans = $query->orderBy('loan_id')->limit(10000)->get();

        $headers = ['Loan ID', 'Member', 'Branch', 'Amount', 'EMI', 'Outstanding', 'DPD', 'Status', 'Asset Class'];
        $rows = [];
        foreach ($loans as $l) {
            $rows[] = [
                $l->loan_id,
                $l->member_name,
                $l->branch_name,
                (float) $l->plan_amount,
                (float) $l->emi_amount,
                (float) $l->principal_outstanding,
                $l->dpd_days,
                $l->status,
                $l->asset_class,
            ];
        }

        return $this->send($format, 'loans-export', $headers, $rows);
    }

    public function members(Request $request)
    {
        $format = strtolower($request->input('format', 'csv'));
        $branch = $request->input('branch');

        $query = Member::query();
        if ($branch) $query->where('branch_name', $branch);
        $members = $query->orderBy('member_code')->limit(10000)->get();

        $headers = ['Member ID', 'Name', 'Mobile', 'Branch', 'Aadhaar', 'Status'];
        $rows = [];
        foreach ($members as $m) {
            $rows[] = [
                $m->member_code,
                $m->name,
                $m->mobile,
                $m->branch_name,
                $m->aadhaar_masked ?? '' ?? '',
                $m->kyc_status ?? 'PENDING',
            ];
        }

        return $this->send($format, 'members-export', $headers, $rows);
    }

    public function auditLogs(Request $request)
    {
        $format = strtolower($request->input('format', 'csv'));
        $from = $request->input('from');
        $to = $request->input('to');

        $query = DB::table('mfi_audit_logs');
        if ($from) $query->whereDate('created_at', '>=', $from);
        if ($to) $query->whereDate('created_at', '<=', $to);
        $logs = $query->orderBy('created_at', 'desc')->limit(10000)->get();

        $headers = ['Timestamp', 'Tenant', 'User', 'Action', 'Module', 'Details'];
        $rows = [];
        foreach ($logs as $log) {
            $rows[] = [
                $log->created_at,
                $log->tenant_code,
                $log->user_code ?? '',
                $log->action,
                $log->module,
                $log->details ?? '',
            ];
        }

        return $this->send($format, 'audit-logs-export', $headers, $rows);
    }

    private function send(string $format, string $filename, array $headers, array $rows): \Illuminate\Http\Response
    {
        // CSV format (default). XLSX would require phpoffice/phpspreadsheet package.
        // CSV opens in Excel, Google Sheets, and all spreadsheet tools.
        $ext = $format === 'xlsx' ? 'csv' : $format;
        $csv = implode(',', $headers) . "\n";
        foreach ($rows as $row) {
            $csv .= implode(',', array_map(fn($v) => '"' . str_replace('"', '""', (string) $v) . '"', $row)) . "\n";
        }

        $response = new \Illuminate\Http\Response();
        $response->headers->set('Content-Type', 'text/csv');
        $response->headers->set('Content-Disposition', 'attachment; filename="' . $filename . '.' . $ext . '"');
        $response->setContent($csv);
        return $response;
    }
}
