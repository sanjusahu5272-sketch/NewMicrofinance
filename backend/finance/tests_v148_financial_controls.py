from datetime import date
from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.exceptions import ValidationError
from rest_framework.test import APIClient
from .models import FinancialPeriodLockRequest
from .views import _assert_financial_period_open, _post_pair


class V148FinancialControlsTests(TestCase):
    def setUp(self):
        User=get_user_model()
        self.maker=User.objects.create_user(username='v148-maker',password='test-password-123',is_staff=True)
        self.approver=User.objects.create_user(username='v148-approver',password='test-password-123',is_staff=True)
        self.client=APIClient(); self.client.force_authenticate(self.maker)

    def test_lock_request_requires_independent_approval_and_blocks_posting(self):
        response=self.client.post('/api/financial-period-locks/',{
            'start_date':'2026-01-01','end_date':'2026-01-31','reason':'Month-end accounts reconciled and reviewed'
        },format='json')
        self.assertEqual(response.status_code,201,response.data)
        lock_id=response.data['id']
        own_approval=self.client.post(f'/api/financial-period-locks/{lock_id}/approve/',{'decision_note':'Looks fine and verified'},format='json')
        self.assertEqual(own_approval.status_code,403)
        self.client.force_authenticate(self.approver)
        approved=self.client.post(f'/api/financial-period-locks/{lock_id}/approve/',{'decision_note':'Independent month-end review completed'},format='json')
        self.assertEqual(approved.status_code,200,approved.data)
        with self.assertRaises(ValidationError):
            _assert_financial_period_open(date(2026,1,15))
        with self.assertRaises(ValidationError):
            _post_pair(date=date(2026,1,15),debit_account='Cash',credit_account='Capital',amount='10.00',reference='V148-LOCKED-POST')
        # A posting outside the closed date range remains allowed by the lock guard.
        _assert_financial_period_open(date(2026,2,1))

    def test_overlapping_pending_or_approved_lock_is_rejected(self):
        FinancialPeriodLockRequest.objects.create(start_date=date(2026,3,1),end_date=date(2026,3,31),reason='First lock request',created_by=self.maker)
        response=self.client.post('/api/financial-period-locks/',{
            'start_date':'2026-03-15','end_date':'2026-04-15','reason':'Overlapping lock should fail'
        },format='json')
        self.assertEqual(response.status_code,409)

    def test_invalid_lock_dates_and_short_reason_are_rejected(self):
        response=self.client.post('/api/financial-period-locks/',{
            'start_date':'2026-04-30','end_date':'2026-04-01','reason':'Bad date range'
        },format='json')
        self.assertEqual(response.status_code,400)
        response=self.client.post('/api/financial-period-locks/',{
            'start_date':'2026-04-01','end_date':'2026-04-30','reason':'no'
        },format='json')
        self.assertEqual(response.status_code,400)
