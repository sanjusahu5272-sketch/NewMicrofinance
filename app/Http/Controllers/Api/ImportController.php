<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use Illuminate\Routing\Controller;
use App\Models\Member;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;

/**
 * Data Import Controller
 *
 * Import members from CSV. Validates each row before insert.
 * Returns per-row results: inserted, skipped (duplicate), error.
 */
class ImportController extends \Illuminate\Routing\Controller
{
    public function members(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'file' => 'required|file|mimes:csv,txt',
            'branch_name' => 'required|string',
        ]);

        if ($validator->fails()) {
            return response()->json(['success' => false, 'errors' => $validator->errors()], 422);
        }

        $file = $request->file('file');
        $branch = $request->input('branch_name');
        $content = file_get_contents($file->getRealPath());
        $lines = array_filter(explode("\n", $content), fn($l) => trim($l) !== '');

        if (count($lines) < 2) {
            return response()->json(['success' => false, 'error' => 'CSV must have headers + at least 1 data row']);
        }

        $headers = str_getcsv(array_shift($lines));
        $requiredCols = ['member_code', 'member_name', 'mobile'];
        $missing = array_diff($requiredCols, $headers);
        if ($missing) {
            return response()->json(['success' => false, 'error' => 'Missing required columns: ' . implode(', ', $missing)]);
        }

        $colMap = array_map(fn($h) => strtolower(trim($h)), $headers);
        $results = ['inserted' => 0, 'skipped' => 0, 'errors' => [], 'total' => count($lines)];
        $seen = [];

        foreach ($lines as $idx => $line) {
            $row = array_combine($colMap, str_getcsv($line));
            $code = trim($row['member_code'] ?? '');

            if ($code === '') {
                $results['errors'][$idx + 2] = 'Missing member_code';
                continue;
            }

            if (isset($seen[$code])) {
                $results['skipped']++;
                continue;
            }

            if (Member::where('member_code', $code)->where('tenant_code', config('mfi.default_tenant', 'TNT-NEEV-01'))->exists()) {
                $results['skipped']++;
                $seen[$code] = true;
                continue;
            }

            try {
                $member = new Member();
                $member->tenant_code = config('mfi.default_tenant', 'TNT-NEEV-01');
                $member->member_code = $code;
                $member->name = trim($row['member_name'] ?? '');
                $member->mobile = trim($row['mobile'] ?? '');
                $member->branch_name = $branch;
                $member->center_name = trim($row['center_name'] ?? '');
                $member->kyc_status = trim($row['kyc_status'] ?? 'PENDING');
                $member->status = 'ACTIVE';
                $member->save();

                $results['inserted']++;
                $seen[$code] = true;
            } catch (\Throwable $e) {
                $results['errors'][$idx + 2] = $e->getMessage();
            }
        }

        return response()->json(['success' => true, 'results' => $results]);
    }
}
