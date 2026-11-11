<?php

return [
    'default_tenant' => env('NEEV_DEFAULT_TENANT', 'TNT-NEEV-01'),

    // Notification gateway driver: log | twilio | sendgrid
    'notification' => [
        'driver' => env('NEEV_NOTIFICATION_DRIVER', 'log'),
    ],
    'rbi_max_foir_pct' => (float) env('MFI_MAX_FOIR_PCT', 50.00),
    'default_gst_pct' => (float) env('MFI_DEFAULT_GST_PCT', 18.00),
    'branch_default_password' => env('NEEV_BRANCH_DEFAULT_PASSWORD', 'Branch@123'),
    'control_ledgers' => [
        'LOAN PORTFOLIO RECEIVABLE',
        'MEMBER DEPOSITS LIABILITY',
        'ADVANCE SECURITY DEPOSIT LIABILITY',
        'LOAN REFINANCE CLEARING',
        'INTER-BRANCH SETTLEMENT CONTROL',
    ],
    'loan_categories' => [
        'INDIVIDUAL LOAN',
        'PERSONAL LOAN',
        'BUSINESS LOAN',
        'PRODUCT LOAN',
        'GOLD LOAN',
        'VEHICLE LOAN',
    ],
];
