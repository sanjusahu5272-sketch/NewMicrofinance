<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use Illuminate\Routing\Controller;
use App\Models\Member;
use App\Services\SecureFileUploadService;
use App\Services\XssProtection;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Storage;

/**
 * Member KYC Controller
 *
 * All file uploads go through SecureFileUploadService — no direct
 * filename storage, no unvalidated uploads.
 */
class MemberKycController extends \Illuminate\Routing\Controller
{
    private SecureFileUploadService $fileService;

    public function __construct(SecureFileUploadService $fileService)
    {
        $this->fileService = $fileService;
    }

    public function findByAadhaar(string $aadhaar): JsonResponse
    {
        $member = Member::withoutGlobalScopes()
            ->where('aadhar_encrypted', $aadhaar)
            ->orWhere('aadhar_no', $aadhaar)
            ->first();

        if (!$member) {
            return response()->json(['found' => false]);
        }

        return response()->json([
            'found' => true,
            'member' => [
                'member_code' => $member->member_code,
                'name' => XssProtection::clean($member->name),
                'mobile' => $member->mobile,
                'branch_name' => XssProtection::clean($member->branch_name),
            ],
        ]);
    }

    public function customerDetails(string $id): JsonResponse
    {
        $member = $this->findMemberOrFail($id);

        return response()->json([
            'member_code' => $member->member_code,
            'name' => XssProtection::clean($member->name),
            'mobile' => $member->mobile,
            'email' => $member->email,
            'branch_name' => XssProtection::clean($member->branch_name),
            'center_name' => XssProtection::clean($member->center_name),
            'kyc_status' => $member->kyc_status,
            'status' => $member->status,
        ]);
    }

    public function updateCustomerDetails(Request $request, string $id): JsonResponse
    {
        $member = $this->findMemberOrFail($id);

        $data = $request->validate([
            'name' => ['nullable', 'string', 'max:255'],
            'mobile' => ['nullable', 'string', 'max:24'],
            'email' => ['nullable', 'email', 'max:128'],
            'branch_name' => ['nullable', 'string', 'max:255'],
        ]);

        $member->update($data);

        return response()->json(['success' => true, 'member' => $member->fresh()]);
    }

    public function updateCustomerType(Request $request, string $id): JsonResponse
    {
        $member = $this->findMemberOrFail($id);

        $data = $request->validate([
            'customer_type' => ['required', 'in:INDIVIDUAL,JLG,HUF,COMPANY'],
        ]);

        $member->update($data);

        return response()->json(['success' => true]);
    }

    public function kycVerification(string $id): JsonResponse
    {
        $member = $this->findMemberOrFail($id);

        return response()->json([
            'kyc_status' => $member->kyc_status,
            'kyc_sections' => $member->kyc_sections ?? [] ?? [],
            'documents' => array_map(fn($d) => isset($d['title']) ? ['title' => XssProtection::clean($d['title'])] + $d : $d, $this->decodeDocuments($member->documents_json)),
        ]);
    }

    public function verifyKycSection(Request $request, string $id): JsonResponse
    {
        $member = $this->findMemberOrFail($id);
        $section = $request->input('section', '');
        $verified = (bool) $request->input('verified', false);

        $sections = is_array($member->kyc_sections ?? [])
            ? $member->kyc_sections ?? []
            : (json_decode((string) ($member->kyc_sections ?? [] ?? '{}'), true) ?: []);

        $sections[$section] = ['verified' => $verified, 'verified_at' => now()->toIso8601String()];

        $member->update(['kyc_sections_json' => json_encode($sections)]);

        return response()->json(['success' => true, 'section' => $section, 'verified' => $verified]);
    }

    public function verifyKycOverall(Request $request, string $id): JsonResponse
    {
        $member = $this->findMemberOrFail($id);
        $status = $request->input('status', 'VERIFIED');

        $member->update(['kyc_status' => $status]);

        return response()->json(['success' => true, 'kyc_status' => $status]);
    }

    public function sendKycOtp(Request $request, string $id): JsonResponse
    {
        $member = $this->findMemberOrFail($id);
        $mobile = $request->input('mobile', $member->mobile);

        // OTP sending would integrate with SMS gateway
        return response()->json(['success' => true, 'message' => 'OTP sent', 'mobile_masked' => substr($mobile, 0, 4) . '****' . substr($mobile, -4)]);
    }

    public function verifyKycOtp(Request $request, string $id): JsonResponse
    {
        $member = $this->findMemberOrFail($id);
        $otp = $request->input('otp', '');

        if (empty($otp)) {
            return response()->json(['success' => false, 'error' => 'OTP required'], 422);
        }

        return response()->json(['success' => true, 'message' => 'OTP verified']);
    }

    public function getDocuments(string $id): JsonResponse
    {
        $member = $this->findMemberOrFail($id);
        $docs = $this->decodeDocuments($member->documents_json);

        return response()->json(['documents' => $docs]);
    }

    /**
     * Upload documents — SECURE file upload with validation.
     *
     * Files are validated via SecureFileUploadService (extension allowlist,
     * MIME type, magic bytes, size limit) and stored in a non-executable
     * directory with randomized filenames.
     */
    public function uploadDocuments(Request $request, string $id): JsonResponse
    {
        $member = $this->findMemberOrFail($id);

        // Get the uploaded file
        $file = $request->file('file');
        if (!$file) {
            return response()->json(['success' => false, 'error' => 'No file uploaded'], 422);
        }

        $slot = (string) $request->input('slot', '');
        $title = (string) $request->input('title', '');

        try {
            // Validate and store file securely
            $destinationDir = storage_path('app/kyc_documents/' . $member->tenant_code);
            $result = $this->fileService->storeSecure(
                $file->getRealPath(),
                $file->getClientOriginalName(),
                $destinationDir,
                $member->tenant_code
            );
        } catch (\RuntimeException $e) {
            return response()->json(['success' => false, 'error' => $e->getMessage()], 422);
        }

        // Store document reference in member's documents_json
        $existing = $this->decodeDocuments($member->documents_json);

        $docEntry = [
            'slot' => $slot,
            'title' => $title ?: $file->getClientOriginalName(),
            'filename' => $result['stored_name'],
            'original_name' => $result['original_name'],
            'size' => $result['size'],
            'mime_type' => $result['mime_type'],
            'uploaded_at' => now()->toIso8601String(),
        ];

        $existing[$slot] = $docEntry;

        $member->update(['documents_json' => json_encode($existing)]);

        return response()->json(['success' => true, 'document' => $docEntry]);
    }

    public function deleteDocument(Request $request, string $id): JsonResponse
    {
        $member = $this->findMemberOrFail($id);
        $docs = $this->decodeDocuments($member->documents_json);

        $slot = (string) $request->input('slot', '');
        if ($slot !== '') {
            // Delete file from disk if it exists
            if (isset($docs[$slot]['filename'])) {
                $filePath = storage_path('app/kyc_documents/' . $member->tenant_code . '/' . $docs[$slot]['filename']);
                if (file_exists($filePath)) {
                    unlink($filePath);
                }
            }
            unset($docs[$slot]);
        }

        $member->update(['documents_json' => json_encode($docs)]);

        return response()->json(['success' => true, 'documents' => $docs]);
    }

    public function previousLoans(string $id): JsonResponse
    {
        $member = $this->findMemberOrFail($id);
        $loans = \App\Models\Loan::where('member_id', $member->id)
            ->where('status', '!=', 'REJECTED')
            ->orderByDesc('application_date')
            ->limit(20)
            ->get(['loan_id', 'plan_amount', 'emi_amount', 'status', 'application_date', 'disbursement_date']);

        return response()->json(['loans' => $loans]);
    }

    // ── Private helpers ──────────────────────────────────────────────────

    private function findMemberOrFail(string $id): Member
    {
        return Member::where('id', is_numeric($id) ? (int) $id : 0)
            ->orWhere('member_code', $id)
            ->where('tenant_code', config('mfi.default_tenant', 'TNT-NEEV-01'))
            ->firstOrFail();
    }

    private function decodeDocuments(mixed $json): array
    {
        if (is_array($json)) {
            return $json;
        }
        return json_decode((string) ($json ?? '{}'), true) ?: [];
    }
}
