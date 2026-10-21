from decimal import Decimal
from django.test import TestCase
from rest_framework.test import APIRequestFactory
from finance.models import LoanProduct
from finance.serializers import LoanProductSerializer


class LoanPlanReferenceFieldsTests(TestCase):
    def test_reference_fields_have_safe_defaults(self):
        plan = LoanProduct.objects.create(name='Reference Plan', code='REF-PLAN', interest_rate=Decimal('18.000'))
        self.assertEqual(plan.plan_amount, Decimal('0.00'))
        self.assertEqual(plan.paid_amount, Decimal('0.00'))
        self.assertEqual(plan.recovery_type, 'monthly')
        self.assertFalse(plan.gst_charge_include)
        self.assertFalse(plan.file_charge_include)
        self.assertEqual(plan.advance_installment, 0)

    def test_reference_fee_fields_reject_negative_values(self):
        serializer = LoanProductSerializer(data={'name':'Reference Plan','code':'REF-PLAN','interest_rate':'18.000','plan_amount':'-1.00'})
        self.assertFalse(serializer.is_valid())
        self.assertIn('plan_amount', serializer.errors)

    def test_paid_amount_is_not_editable_on_existing_plan(self):
        plan = LoanProduct.objects.create(name='Reference Plan', code='REF-PLAN', interest_rate=Decimal('18.000'))
        serializer = LoanProductSerializer(instance=plan, data={'paid_amount':'50.00'}, partial=True)
        self.assertFalse(serializer.is_valid())
        self.assertIn('paid_amount', serializer.errors)
