# NEEV 4D — Multi-Tenant SaaS Microfinance Core Banking ERP (Laravel 11 + PostgreSQL 16)

**NEEV 4D** is a self-contained full-stack microfinance management platform: 23 navigation groups, 124 sub-menus, 141 operational screens, live dashboard analytics, RBI-compliant FOIR assessment, actuarial EMI/APR engine (`BcMath`), double-entry accounting, and payment-gateway/webhook integration.

---

## 1. Architecture & Technology Stack

| Layer | Technology | Details |
| :--- | :--- | :--- |
| **Frontend** | JavaScript ES2022 + React 18 / Vite (`frontend/src/bundle_entry.js`) | NEEV 4D design tokens (`frontend/src/styles/tokens.css`), collapsible 23-group sidebar with 124 sub-menus, live SVG donut charts & analog clock, 5-tab member KYC form, EMI calculator, printable receipts, CSV/Excel exports |
| **Backend** | PHP 8.2 / 8.3 + Laravel 11 (`app/Http/Controllers/Api/`, `app/Services/`) | `ActuarialLoanEngine`, `LoanWorkflowService`, `DoubleEntryLedgerService`, `TreasuryReconciliationService`, `CollectionsNpaService`, `OwnerFundingService`, `PaymentGatewayService` |
| **Database** | PostgreSQL 16 (`pgsql`) | Relational core-banking tables with `DECIMAL(18,2)` precision, PL/pgSQL append-only audit & double-entry immutability triggers (`database/migrations/2026_01_01_000006_...php`), foreign keys, and idempotency keys |
| **Containerization** | Docker Compose (`docker-compose.yml` & `docker-compose.prod.yml`) | Unified `db` (`postgres:16-alpine`), `redis` (`redis:7-alpine`), `app` (`php:8.3-fpm-alpine`), and `nginx` (`nginx:1.27-alpine`) services |

---

## 2. Quick Start — Docker Compose (Production / Full Stack)

1. **Copy the environment configuration file**:
   ```bash
   cp .env.example .env
   ```
2. **Edit `.env`** and set strong values for `DB_PASSWORD`, `APP_KEY`, `NEEV_JWT_SECRET`, and `NEEV_KYC_ENC_KEY`.
3. **Build and start all containers**:
   ```bash
   docker compose up --build -d
   ```
4. **Run PostgreSQL migrations and seed initial master data**:
   ```bash
   docker compose exec app php artisan migrate --seed --force
   ```
5. **Access the application**:
   - **Web UI & REST API (via Nginx)**: `http://localhost:8080`
   - **Healthcheck**: `http://localhost:8080/api/health/ready`

---

## 3. Quick Start — Local Standalone Setup (PHP 8.2+ & PostgreSQL 16)

```bash
# 1. Install Composer dependencies & configure .env
cp .env.example .env
composer install
php artisan key:generate

# 2. Run PostgreSQL 16 migrations & seeders
php artisan migrate --seed

# 3. Run actuarial & ledger reconciliation audit commands
php artisan mfi:audit-loan-math
php artisan mfi:audit-ledger-reconciliation

# 4. Rebuild frontend bundle (if modifying frontend/src/)
cd frontend && npm run build && cd ..

# 5. Start Laravel server on port 8000
php artisan serve --host=0.0.0.0 --port=8000
```
