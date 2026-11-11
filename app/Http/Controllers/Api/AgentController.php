<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Models\Employee;
use App\Models\Installment;
use App\Models\Loan;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Routing\Controller;

/**
 * Field agent app API — Feature 7 of the new-feature batch.
 *
 * All endpoints scope to the agent's branch (from the authenticated token).
 *
 * GET  /api/agent/context            agent profile + today snapshot
 * GET  /api/agent/loans              loans under the agent
 * GET  /api/agent/tasks              due EMIs (work queue)
 * GET  /api/agent/collections        collections by date range
 * POST /api/agent/collections        collect EMI (proxies LoanController::collectEmi)
 */
class AgentController extends Controller
{
    public function context(Request $request): JsonResponse
    {
        $agent = $this->agent($request);

        $today = now()->toDateString();
        $branch = (string) $agent->branch_name;

        $loanIds = Loan::query()->where('branch_name', $branch)->pluck('id');

        $todaysCollections = \App\Models\EmiCollection::query()
            ->whereDate('payment_date', $today)
            ->where(function ($q) use ($branch) {
                $q->where('branch_name', $branch);
            })
            ->get();

        $dueCount = $loanIds->isNotEmpty()
            ? Installment::query()
                ->whereIn('loan_pk', $loanIds)
                ->whereIn('status', ['DUE', 'PENDING'])
                ->count()
            : 0;

        $activeLoanCount = $loanIds->isNotEmpty()
            ? Loan::query()->whereIn('id', $loanIds)->whereIn('status', ['APPROVED', 'DISBURSED'])->count()
            : 0;

        return response()->json([
            'agent' => [
                'id' => $agent->id,
                'user_code' => $agent->user_code,
                'name' => $agent->name,
                'branch_name' => $branch,
                'role_name' => $agent->role_name ?? '',
            ],
            'today' => $today,
            'todays_collection_count' => $todaysCollections->count(),
            'todays_collection_amount' => (float) $todaysCollections->sum('amount'),
            'active_loans' => $activeLoanCount,
            'due_emis' => $dueCount,
        ]);
    }

    public function loans(Request $request): JsonResponse
    {
        $agent = $this->agent($request);
        $branch = (string) $agent->branch_name;

        $query = Loan::query()->where('branch_name', $branch);

        if ($request->input('member_id')) {
            $query->where('member_id', (int) $request->input('member_id'));
        }
        if ($request->input('status')) {
            $query->where('status', strtoupper((string) $request->input('status')));
        }

        return response()->json([
            'loans' => $query->orderByDesc('id')->paginate(min((int) $request->input('limit', 25), 100)),
        ]);
    }

    public function tasks(Request $request): JsonResponse
    {
        $agent = $this->agent($request);
        $branch = (string) $agent->branch_name;

        $loanIds = Loan::query()->where('branch_name', $branch)->pluck('id');

        $query = Installment::query()
            ->whereIn('status', ['DUE', 'PENDING'])
            ->orderBy('due_date');

        if ($loanIds->isNotEmpty()) {
            $query->whereIn('loan_pk', $loanIds);
        } else {
            $query->whereRaw('1 = 0');
        }

        if ($request->input('from')) {
            $query->whereDate('due_date', '>=', (string) $request->input('from'));
        }
        if ($request->input('to')) {
            $query->whereDate('due_date', '<=', (string) $request->input('to'));
        }

        $rows = $query->limit(100)->get();

        return response()->json([
            'due_count' => $rows->count(),
            'tasks' => $rows->map(fn (Installment $i): array => [
                'id' => $i->id,
                'loan_pk' => $i->loan_pk,
                'emi_no' => $i->emi_no,
                'due_date' => (string) $i->due_date,
                'emi_amount' => (float) $i->emi_amount,
                'dpd_days' => (int) $i->dpd_days,
                'status' => $i->status,
            ])->values()->all(),
        ]);
    }

    public function collections(Request $request): JsonResponse
    {
        $agent = $this->agent($request);
        $branch = (string) $agent->branch_name;

        $query = \App\Models\EmiCollection::query()
            ->where('branch_name', $branch)
            ->orderByDesc('payment_date');

        if ($request->input('from')) {
            $query->whereDate('payment_date', '>=', (string) $request->input('from'));
        }
        if ($request->input('to')) {
            $query->whereDate('payment_date', '<=', (string) $request->input('to'));
        }

        return response()->json([
            'collections' => $query->limit(100)->get(),
        ]);
    }

    public function collect(Request $request): JsonResponse
    {
        // Delegate to the full-strength LoanController collection pipeline
        // (principal/interest split, penalties, ledger posting) so the agent
        // app and the back office share exactly one implementation.
        $loanController = app(LoanController::class);

        return $loanController->collectEmi($request);
    }

    private function agent(Request $request): Employee
    {
        $authUser = (array) $request->attributes->get('auth_user', []);
        $employeeId = (int) ($authUser['id'] ?? 0);

        $agent = Employee::withoutGlobalScopes()->find($employeeId);
        if ($agent === null) {
            abort(401, 'Authenticated employee not found.');
        }

        return $agent;
    }
}
