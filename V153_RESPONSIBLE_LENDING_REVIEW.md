# V153 Responsible Lending Review (Dashboard Frozen)

## Scope
This release adds an approval-time affordability gate to the existing personal-loan application workflow. It does not redesign the V66 dashboard, alter the V119 menu structure, or change Short Keys.

## New approval checks
- The newest household-income assessment for the member must exist.
- The newest assessment must be independently verified (verified flag, verifier, and timestamp all present).
- The assessment date must be today or within the previous 90 days.
- Monthly household income must be greater than zero.
- The 50% monthly household repayment-obligation ceiling is applied without an annual-income INR 300,000 threshold.
- Existing application approval validations (maker-checker, member/product active, duplicate pending application, KYC, and product income multiple) remain in place.

## Why
RBI's microfinance framework describes a 50% monthly household repayment-obligation limit for applicable microfinance loans and certain other loans to low-income households. This software applies the 50% ceiling without an annual-income INR 300,000 threshold; confirm with the lender's compliance officer whether this rule should apply to every product offered by this entity. It also says expected income from the asset/activity financed by the loan must not be counted in household income. This software gate uses the verified assessment's recorded monthly income and obligations; it does not itself prove that the figures are accurate or that every rule applicable to the lender has been implemented.

## Important limitation
The assessment model currently stores a proposed monthly obligation but does not bind that figure to the exact approved loan amount or calculate it from the actual product repayment schedule. Therefore, this is an additional gate, not a complete underwriting engine. Before production, calculate the proposed obligation from the final approved principal, rate, fees, tenure, and frequency, and require the assessment value to match that calculated value within an explicitly approved tolerance. The lender's legal/compliance officer must confirm applicability and policy settings for the entity's legal category.

## Verification status
- Python syntax compilation: checked in packaging environment.
- ZIP integrity: checked.
- Django test suite, database migration/runtime, PostgreSQL concurrency, frontend production build, and browser acceptance tests: not executed in this environment. Do not treat this release as production-certified.

## Research basis
- RBI, Regulatory Framework for Microfinance Loans FAQ (updated 30 Jan 2025): https://www.rbi.org.in/commonperson/English/Scripts/FAQs.aspx?Id=3366
- RBI, Digital Lending Directions, 2025: https://www.rbi.org.in/
- CGAP, Operational Risk Management for Microfinance Institutions: https://www.cgap.org/research/publication/operational-risk-management-for-microfinance-institutions
- CGAP, Building Value in Microfinance Through Digitization: https://www.cgap.org/research/publication/building-value-microfinance-through-digitization-lessons-loan-automation
