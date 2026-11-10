<?php

declare(strict_types=1);

namespace App\Services;

use Illuminate\Support\Facades\Log;

use RuntimeException;

/**
 * Secure File Upload Service
 *
 * Defense-in-depth file upload validation:
 *   1. Extension allowlist (whitelist, not blacklist)
 *   2. MIME type verification (via finfo, not client-provided)
 *   3. Magic bytes / file signature validation
 *   4. File size restrictions
 *   5. Executable file blocking
 *   6. Randomized filename generation
 *   7. Path traversal protection
 *   8. Secure storage in non-executable directory
 */
class SecureFileUploadService
{
    /** Allowed extensions for KYC documents. */
    public const ALLOWED_EXTENSIONS = [
        'pdf', 'jpg', 'jpeg', 'png', 'webp', 'bmp', 'gif',
        'doc', 'docx', 'xls', 'xlsx', 'txt',
    ];

    /** Allowed MIME types. */
    public const ALLOWED_MIME_TYPES = [
        'application/pdf',
        'image/jpeg',
        'image/png',
        'image/webp',
        'image/bmp',
        'image/gif',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'text/plain',
    ];

    /** Maximum file size: 10 MB. */
    public const MAX_FILE_SIZE = 10 * 1024 * 1024;

    /** Magic bytes signatures for file type verification. */
    private const MAGIC_BYTES = [
        'pdf' => ['%PDF'],
        'jpg' => ['\xFF\xD8\xFF'],
        'jpeg' => ['\xFF\xD8\xFF'],
        'png' => ['\x89PNG'],
        'gif' => ['GIF87a', 'GIF89a'],
        'webp' => ['RIFF'],
        'bmp' => ['BM'],
        'doc' => ['\xD0\xCF\x11\xE0'],
        'docx' => ['PK\x03\x04'],
        'xls' => ['\xD0\xCF\x11\xE0'],
        'xlsx' => ['PK\x03\x04'],
    ];

    /**
     * Validate and store an uploaded file securely.
     *
     * @throws RuntimeException if validation fails
     */
    public function storeSecure(string $filePath, string $originalName, string $destinationDir, string $tenantCode): array
    {
        // 1. Extension allowlist
        $extension = strtolower(pathinfo($originalName, PATHINFO_EXTENSION));
        if (!in_array($extension, self::ALLOWED_EXTENSIONS, true)) {
            throw new RuntimeException("File extension '{$extension}' is not allowed.");
        }

        // 2. File size check
        $fileSize = filesize($filePath);
        if ($fileSize === false) {
            throw new RuntimeException('File could not be read.');
        }
        if ($fileSize > self::MAX_FILE_SIZE) {
            throw new RuntimeException('File exceeds maximum allowed size of 10 MB.');
        }
        if ($fileSize === 0) {
            throw new RuntimeException('File is empty.');
        }

        // 3. MIME type verification via finfo (not client-provided)
        $finfo = new \finfo(FILEINFO_MIME_TYPE);
        $detectedMime = $finfo->file($filePath);
        if ($detectedMime === false || !in_array($detectedMime, self::ALLOWED_MIME_TYPES, true)) {
            throw new RuntimeException("Detected MIME type '{$detectedMime}' is not allowed.");
        }

        // 4. Magic bytes validation
        $this->validateMagicBytes($filePath, $extension);

        // 5. Malware scanning (if ClamAV available)
        $malware = (new MalwareScanService())->scan($filePath);
        if (!$malware['clean']) {
            @unlink($filePath);
            Log::warning('Malware detected in upload', [
                'threat' => $malware['threat'],
                'original_name' => $originalName,
            ]);
            throw new RuntimeException('File rejected: malware detected (' . $malware['threat'] . ').');
        }

        // 6. Path traversal protection — generate safe filename
        $safeName = $this->generateSafeFilename($originalName, $tenantCode);
        $safePath = rtrim($destinationDir, '/\\') . '/' . $safeName;

        // 7. Ensure destination directory exists
        if (!is_dir($destinationDir)) {
            mkdir($destinationDir, 0750, true);
        }

        // 8. Move file to secure location
        if (!rename($filePath, $safePath)) {
            throw new RuntimeException('Failed to store file securely.');
        }

        // 9. Set restrictive permissions
        chmod($safePath, 0640);

        return [
            'stored_path' => $safePath,
            'original_name' => $originalName,
            'stored_name' => $safeName,
            'size' => $fileSize,
            'mime_type' => $detectedMime,
            'extension' => $extension,
        ];
    }

    /**
     * Validate file magic bytes against known signatures.
     */
    private function validateMagicBytes(string $filePath, string $extension): void
    {
        $head = fopen($filePath, 'rb');
        if ($head === false) {
            throw new RuntimeException('Could not read file for magic byte validation.');
        }
        $firstBytes = fread($head, 16);
        fclose($head);

        $signatures = self::MAGIC_BYTES[$extension] ?? [];
        if (empty($signatures)) {
            // No magic bytes known for this extension — skip (txt, etc.)
            return;
        }

        $matched = false;
        foreach ($signatures as $sig) {
            // Convert hex escape sequences to actual bytes
            $pattern = str_replace(['\\x', '\\'], ['', ''], $sig);
            if ($pattern !== '' && str_starts_with($firstBytes, $pattern)) {
                $matched = true;
                break;
            }
        }

        if (!$matched) {
            throw new RuntimeException('File content does not match expected type (magic bytes mismatch).');
        }
    }

    /**
     * Generate a randomized, safe filename with tenant prefix.
     */
    private function generateSafeFilename(string $originalName, string $tenantCode): string
    {
        $ext = strtolower(pathinfo($originalName, PATHINFO_EXTENSION));
        $random = bin2hex(random_bytes(16));
        $tenantPrefix = preg_replace('/[^A-Za-z0-9]/', '', substr($tenantCode, 0, 8));
        return "{$tenantPrefix}_{$random}.{$ext}";
    }

    /**
     * Get a secure file path for download, verifying it exists and is in the allowed directory.
     */
    public function getSecurePath(string $storedName, string $baseDir): string
    {
        // Path traversal protection: reject any path with .. or /
        if (str_contains($storedName, '..') || str_contains($storedName, '/') || str_contains($storedName, '\\')) {
            throw new RuntimeException('Invalid file path.');
        }

        $fullPath = rtrim($baseDir, '/\\') . '/' . $storedName;
        $realPath = realpath($fullPath);
        $realBase = realpath($baseDir);

        if ($realPath === false || !str_starts_with($realPath, $realBase)) {
            throw new RuntimeException('File not found or path traversal detected.');
        }

        return $realPath;
    }
}
