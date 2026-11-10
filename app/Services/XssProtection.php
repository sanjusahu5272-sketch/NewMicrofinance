<?php

declare(strict_types=1);

namespace App\Services;

/**
 * XSS Protection Service
 *
 * Provides output encoding for any data returned to the frontend.
 * Use this when returning user-generated content in API responses
 * that will be rendered as HTML.
 *
 * Laravel's Blade auto-escapes by default, but JSON API responses
 * do not. Always wrap user content with XssProtection::clean()
 * before returning it in JSON responses that will be rendered as HTML.
 */
class XssProtection
{
    /**
     * Encode a string for safe HTML output.
     */
    public static function clean(?string $value): string
    {
        if ($value === null) {
            return '';
        }

        return htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8', false);
    }

    /**
     * Encode an array of strings for safe HTML output.
     */
    public static function cleanArray(array $data): array
    {
        $result = [];
        foreach ($data as $key => $value) {
            if (is_array($value)) {
                $result[$key] = self::cleanArray($value);
            } elseif (is_string($value)) {
                $result[$key] = self::clean($value);
            } else {
                $result[$key] = $value;
            }
        }
        return $result;
    }

    /**
     * Strip all HTML tags from a string.
     * Use for fields that should never contain HTML (names, comments, etc.).
     */
    public static function stripTags(?string $value): string
    {
        if ($value === null) {
            return '';
        }

        return strip_tags($value);
    }

    /**
     * Validate that a string contains no script tags.
     */
    public static function containsScript(?string $value): bool
    {
        if ($value === null) {
            return false;
        }

        return (bool) preg_match('/<script|javascript:|on\w+\s*=/i', $value);
    }
}
