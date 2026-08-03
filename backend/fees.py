"""
Transfer fee model — the ONE place these numbers are defined.

Every fee shown anywhere in the app (the fee-quote screen, an actual
transfer, the transaction-detail "why did I pay this" explainer, bulk
invoice payments) must call these functions, not recompute the constants
inline. A leaf module (imports nothing app-specific) so both server.py and
extras3.py can import it without a circular dependency — same pattern as
rates.py from Feature 1.
"""

FEE_PERCENT = 0.006       # 0.6%
FEE_MIN = 0.99
PAYPAL_COMPARISON_PERCENT = 0.044   # ~4.4%, typical PayPal international rate
PAYPAL_COMPARISON_MIN = 3.99


def calc_transfer_fee(amount: float) -> float:
    return round(max(FEE_MIN, amount * FEE_PERCENT), 2)


def calc_paypal_comparison_fee(amount: float) -> float:
    return round(max(PAYPAL_COMPARISON_MIN, amount * PAYPAL_COMPARISON_PERCENT), 2)


def calc_savings_vs_paypal(amount: float, our_fee: float) -> float:
    return round(calc_paypal_comparison_fee(amount) - our_fee, 2)
