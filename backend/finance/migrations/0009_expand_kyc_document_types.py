from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [('finance', '0008_security_and_underwriting')]

    operations = [
        migrations.AlterField(
            model_name='kycdocument',
            name='document_type',
            field=models.CharField(max_length=20, choices=[
                ('photo', 'Customer / Member Photo'),
                ('aadhaar', 'Aadhaar Card'),
                ('pan', 'PAN Card'),
                ('identity', 'Other Identity Proof'),
                ('address', 'Address Proof'),
                ('bank_passbook', 'Bank Passbook'),
                ('bank_statement', 'Bank Statement'),
                ('cancelled_cheque', 'Cancelled Cheque'),
                ('income', 'Income Proof'),
                ('signature', 'Customer Signature'),
                ('voter_id', 'Voter ID'),
                ('driving_license', 'Driving Licence'),
                ('passport', 'Passport'),
                ('utility_bill', 'Utility Bill'),
                ('loan_agreement', 'Signed Loan Agreement'),
                ('nominee_document', 'Nominee / Guarantor Document'),
                ('other', 'Other Supporting Document'),
            ]),
        ),
    ]
