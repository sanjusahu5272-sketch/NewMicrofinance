# V116 — Financial Integrity Audit (read-only)

Added a read-only management command to help find inconsistencies before staff close the books.

## Run locally with Docker
From `NMFA_Production_v3`:

```cmd
docker compose exec backend python manage.py audit_financial_integrity
```

Strict mode returns a non-zero exit when findings exist:

```cmd
docker compose exec backend python manage.py audit_financial_integrity --strict
```

The command checks for non-positive payment amounts, reversed/refunded payment metadata inconsistencies, disbursed loans without a successful disbursement record, installment schedule totals that differ from a loan's total payable, and suspicious unbalanced journal references. It never repairs or changes data. Findings require human review; legacy references may need interpretation before correcting anything.

## Tests

```cmd
docker compose exec backend python manage.py test finance.tests_financial_integrity_command
```

This addition does not change database models and therefore adds no migration. It does not claim to complete every financial workflow or certify production readiness; payment allocation, reversals, approval permissions, and real gateway behavior still need separate targeted tests and staging verification.
