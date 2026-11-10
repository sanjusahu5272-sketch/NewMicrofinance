<?php

declare(strict_types=1);

use Illuminate\Support\Facades\Schedule;

/*
|--------------------------------------------------------------------------
| Console Routes & Automated Nightly Financial Integrity Schedule
|--------------------------------------------------------------------------
| Runs deterministic BCMath loan math audits, RBI IRACP DPD/SMA/NPA
| provisioning, and Subledger-to-GL reconciliation every night.
*/

Schedule::command('mfi:audit-loan-math')
    ->dailyAt('23:30')
    ->withoutOverlapping()
    ->runInBackground();

Schedule::command('mfi:audit-ledger-reconciliation --run-eod-npa')
    ->dailyAt('23:45')
    ->withoutOverlapping()
    ->runInBackground();
