<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Tenant extends Model
{
    protected $table = 'mfi_tenants';
    protected $fillable = ['tenant_code', 'company_name', 'deployment_model', 'vps_node_id', 'plan_tier', 'max_branches', 'max_active_loans', 'lifecycle_state', 'feature_flags_json'];
    
}
