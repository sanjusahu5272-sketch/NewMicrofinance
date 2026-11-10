<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use App\Models\Tenant;
use App\Models\Branch;
use App\Models\Role;
use App\Models\Employee;
use App\Models\LoanPlan;
use App\Models\Ledger;
use App\Models\Member;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        Tenant::firstOrCreate(
            ['tenant_code' => 'TNT-NEEV-01'],
            [
                'company_name' => 'NEEV MICROFINANCE CARE PVT. LTD.',
                'deployment_model' => 'SHARED_SAAS_POSTGRES',
                'plan_tier' => 'ENTERPRISE_NBFC_MFI',
                'lifecycle_state' => 'ACTIVE',
            ]
        );

        foreach (['ADMIN', 'BRANCH MANAGER', 'FIELD OFFICER', 'ACCOUNTANT', 'AUDITOR'] as $rName) {
            Role::firstOrCreate(
                ['name' => $rName],
                ['tenant_code' => 'TNT-NEEV-01', 'status' => 'ACTIVE']
            );
        }

        $branchesData = [
            ['code' => 'BR001', 'name' => 'KATNI MAIN BRANCH', 'manager_name' => 'KRISHNESHWAR GUPTA', 'city' => 'BAHORIBAND', 'address' => 'Bus Stand, Khasra No. 871/1, Bahoriband, Katni - 483330', 'phone' => '9926223303', 'contact_email' => 'katni@neevmicrocare.com'],
            ['code' => 'BR002', 'name' => 'JABALPUR CITY BRANCH', 'manager_name' => 'ROHIT SHARMA', 'city' => 'VIJAY NAGAR', 'address' => 'Plot 14, Scheme No. 41, Vijay Nagar, Jabalpur - 482002', 'phone' => '9826112233', 'contact_email' => 'jabalpur@neevmicrocare.com'],
            ['code' => 'BR003', 'name' => 'BHOPAL MP NAGAR BRANCH', 'manager_name' => 'PRIYA VERMA', 'city' => 'MP NAGAR ZONE 2', 'address' => '2nd Floor, Pragati Bhawan, MP Nagar Zone-II, Bhopal - 462011', 'phone' => '9755443322', 'contact_email' => 'bhopal@neevmicrocare.com'],
            ['code' => 'BR004', 'name' => 'INDORE HEAD OFFICE', 'manager_name' => 'RAJESH SHARMA', 'city' => 'Indore', 'address' => 'Vijay Nagar Square, AB Road, Indore', 'phone' => '9826012345', 'contact_email' => 'indore@microfincare.com'],
        ];

        $firstBranch = null;
        foreach ($branchesData as $b) {
            $br = Branch::firstOrCreate(
                ['code' => $b['code']],
                [
                    'tenant_code' => 'TNT-NEEV-01',
                    'name' => $b['name'],
                    'manager_name' => $b['manager_name'],
                    'password_hash' => Hash::make(bin2hex(random_bytes(8))),
                    'must_change_password' => true,
                    'opening_date' => '2026-01-01',
                    'address' => $b['address'],
                    'city' => $b['city'],
                    'state' => 'MADHYA PRADESH',
                    'country' => 'India',
                    'pincode' => '452001',
                    'contact_email' => $b['contact_email'],
                    'phone' => $b['phone'],
                    'status' => 'ACTIVE',
                ]
            );
            if (!$firstBranch) {
                $firstBranch = $br;
            }
        }

        Employee::firstOrCreate(
            ['user_code' => 'ADM01'],
            [
                'tenant_code' => 'TNT-NEEV-01',
                'name' => 'SUPER ADMIN',
                'alias' => 'ADMIN',
                'email' => 'admin@microfincare.com',
                'mobile' => '9926223303',
                'designation' => 'MANAGING DIRECTOR',
                'role_id' => 1,
                'role_name' => 'ADMIN',
                'branch_id' => $firstBranch->id,
                'branch_name' => $firstBranch->name,
                'password_hash' => Hash::make('Admin@123'),
                    'must_change_password' => true,
                'kyc_status' => 'VERIFIED',
                'login_status' => 'ACTIVE',
            ]
        );

        $ledgers = [
            ['name' => 'CASH IN HAND', 'group_name' => 'CURRENT ASSETS', 'nature' => 'ASSET', 'opening_balance' => '500000.00', 'closing_balance' => '500000.00'],
            ['name' => 'BANK ACCOUNT', 'group_name' => 'CURRENT ASSETS', 'nature' => 'ASSET', 'opening_balance' => '1500000.00', 'closing_balance' => '1500000.00'],
            ['name' => 'LOAN PORTFOLIO RECEIVABLE', 'group_name' => 'LOAN PORTFOLIO ASSETS', 'nature' => 'ASSET', 'opening_balance' => '0.00', 'closing_balance' => '0.00'],
            ['name' => 'PROMOTER SHARE CAPITAL ACCOUNT', 'group_name' => 'CAPITAL ACCOUNT', 'nature' => 'LIABILITY', 'opening_balance' => '2000000.00', 'closing_balance' => '2000000.00'],
            ['name' => 'INTEREST ON MICRO LOANS (INCOME)', 'group_name' => 'DIRECT INCOME', 'nature' => 'INCOME', 'opening_balance' => '0.00', 'closing_balance' => '0.00'],
            ['name' => 'PROCESSING & FILE CHARGE INCOME', 'group_name' => 'DIRECT INCOME', 'nature' => 'INCOME', 'opening_balance' => '0.00', 'closing_balance' => '0.00'],
            ['name' => 'PENALTY & BOUNCE CHARGE INCOME', 'group_name' => 'DIRECT INCOME', 'nature' => 'INCOME', 'opening_balance' => '0.00', 'closing_balance' => '0.00'],
        ];
        foreach ($ledgers as $led) {
            Ledger::firstOrCreate(
                ['name' => $led['name']],
                array_merge($led, ['tenant_code' => 'TNT-NEEV-01', 'branch_name' => 'KATNI MAIN BRANCH', 'status' => 'ACTIVE'])
            );
        }

        LoanPlan::firstOrCreate(
            ['plan_name' => 'INDIVIDUAL BUSINESS LOAN 50K (12M)'],
            [
                'tenant_code' => 'TNT-NEEV-01',
                'plan_type' => 'INDIVIDUAL LOAN',
                'recovery_type' => 'MONTHLY',
                'tenure_emis' => 12,
                'interest_rate_pa' => '22.00',
                'interest_type' => 'REDUCING',
                'roi_unit' => 'YEARLY',
                'plan_amount' => '50000.00',
                'disbursement_amount' => '48150.00',
                'collection_amount' => '56156.63',
                'emi_amount' => '4679.72',
                'effective_apr_pct' => '33.67',
                'file_charge' => '500.00',
                'pf_percentage' => '2.00',
                'pf_amount' => '1000.00',
                'insurance_amount' => '350.00',
                'status' => 'ACTIVE',
            ]
        );
    }
}
