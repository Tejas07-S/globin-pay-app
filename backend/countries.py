"""Country ↔ currency ↔ corridor map for GlobalPay AI.

Curated subset of high-volume remittance corridors + major economies (~50 shown
but the flow supports any of them). Each entry declares:
- name, iso alpha-2, dial code, emoji flag
- primary currency
- payment methods available in that corridor
- estimated delivery time
"""
from __future__ import annotations
from typing import List, Dict

COUNTRIES: List[Dict] = [
    {"code": "US", "name": "United States", "flag": "🇺🇸", "currency": "USD", "dial": "+1",  "methods": ["Bank transfer", "Debit card", "Apple Pay"],       "eta": "Minutes"},
    {"code": "GB", "name": "United Kingdom","flag": "🇬🇧", "currency": "GBP", "dial": "+44", "methods": ["Bank transfer", "Faster Payments"],                "eta": "Minutes"},
    {"code": "DE", "name": "Germany",       "flag": "🇩🇪", "currency": "EUR", "dial": "+49", "methods": ["SEPA", "Bank transfer"],                          "eta": "Same day"},
    {"code": "FR", "name": "France",        "flag": "🇫🇷", "currency": "EUR", "dial": "+33", "methods": ["SEPA", "Bank transfer"],                          "eta": "Same day"},
    {"code": "ES", "name": "Spain",         "flag": "🇪🇸", "currency": "EUR", "dial": "+34", "methods": ["SEPA", "Bank transfer"],                          "eta": "Same day"},
    {"code": "IT", "name": "Italy",         "flag": "🇮🇹", "currency": "EUR", "dial": "+39", "methods": ["SEPA", "Bank transfer"],                          "eta": "Same day"},
    {"code": "NL", "name": "Netherlands",   "flag": "🇳🇱", "currency": "EUR", "dial": "+31", "methods": ["iDEAL", "SEPA"],                                   "eta": "Same day"},
    {"code": "IE", "name": "Ireland",       "flag": "🇮🇪", "currency": "EUR", "dial": "+353","methods": ["SEPA", "Bank transfer"],                          "eta": "Same day"},
    {"code": "CH", "name": "Switzerland",   "flag": "🇨🇭", "currency": "CHF", "dial": "+41", "methods": ["Bank transfer", "TWINT"],                          "eta": "Same day"},
    {"code": "CA", "name": "Canada",        "flag": "🇨🇦", "currency": "CAD", "dial": "+1",  "methods": ["Interac e-Transfer", "Bank transfer"],             "eta": "Minutes"},
    {"code": "AU", "name": "Australia",     "flag": "🇦🇺", "currency": "AUD", "dial": "+61", "methods": ["PayID", "Bank transfer"],                          "eta": "Minutes"},
    {"code": "NZ", "name": "New Zealand",   "flag": "🇳🇿", "currency": "AUD", "dial": "+64", "methods": ["Bank transfer"],                                   "eta": "Same day"},
    {"code": "SG", "name": "Singapore",     "flag": "🇸🇬", "currency": "SGD", "dial": "+65", "methods": ["PayNow", "FAST", "Bank transfer"],                 "eta": "Minutes"},
    {"code": "JP", "name": "Japan",         "flag": "🇯🇵", "currency": "JPY", "dial": "+81", "methods": ["Bank transfer"],                                   "eta": "Same day"},
    {"code": "KR", "name": "South Korea",   "flag": "🇰🇷", "currency": "USD", "dial": "+82", "methods": ["Bank transfer"],                                   "eta": "Same day"},
    {"code": "CN", "name": "China",         "flag": "🇨🇳", "currency": "CNY", "dial": "+86", "methods": ["AliPay", "WeChat Pay", "Bank"],                    "eta": "1–2 hours"},
    {"code": "IN", "name": "India",         "flag": "🇮🇳", "currency": "INR", "dial": "+91", "methods": ["UPI", "IMPS", "Bank transfer"],                    "eta": "Minutes"},
    {"code": "PK", "name": "Pakistan",      "flag": "🇵🇰", "currency": "USD", "dial": "+92", "methods": ["Bank transfer", "Mobile wallet"],                  "eta": "Same day"},
    {"code": "BD", "name": "Bangladesh",    "flag": "🇧🇩", "currency": "USD", "dial": "+880","methods": ["bKash", "Bank transfer"],                          "eta": "Same day"},
    {"code": "LK", "name": "Sri Lanka",     "flag": "🇱🇰", "currency": "USD", "dial": "+94", "methods": ["Bank transfer"],                                   "eta": "Same day"},
    {"code": "PH", "name": "Philippines",   "flag": "🇵🇭", "currency": "USD", "dial": "+63", "methods": ["GCash", "PayMaya", "Bank"],                        "eta": "Minutes"},
    {"code": "TH", "name": "Thailand",      "flag": "🇹🇭", "currency": "USD", "dial": "+66", "methods": ["PromptPay", "Bank"],                               "eta": "Minutes"},
    {"code": "VN", "name": "Vietnam",       "flag": "🇻🇳", "currency": "USD", "dial": "+84", "methods": ["Bank transfer"],                                   "eta": "Same day"},
    {"code": "ID", "name": "Indonesia",     "flag": "🇮🇩", "currency": "USD", "dial": "+62", "methods": ["Bank transfer", "OVO"],                            "eta": "Same day"},
    {"code": "MY", "name": "Malaysia",      "flag": "🇲🇾", "currency": "USD", "dial": "+60", "methods": ["DuitNow", "Bank"],                                 "eta": "Minutes"},
    {"code": "AE", "name": "UAE",           "flag": "🇦🇪", "currency": "AED", "dial": "+971","methods": ["Bank transfer"],                                   "eta": "Same day"},
    {"code": "SA", "name": "Saudi Arabia",  "flag": "🇸🇦", "currency": "USD", "dial": "+966","methods": ["Bank transfer"],                                   "eta": "Same day"},
    {"code": "QA", "name": "Qatar",         "flag": "🇶🇦", "currency": "USD", "dial": "+974","methods": ["Bank transfer"],                                   "eta": "Same day"},
    {"code": "KW", "name": "Kuwait",        "flag": "🇰🇼", "currency": "USD", "dial": "+965","methods": ["Bank transfer"],                                   "eta": "Same day"},
    {"code": "IL", "name": "Israel",        "flag": "🇮🇱", "currency": "USD", "dial": "+972","methods": ["Bank transfer"],                                   "eta": "Same day"},
    {"code": "TR", "name": "Turkey",        "flag": "🇹🇷", "currency": "USD", "dial": "+90", "methods": ["Bank transfer"],                                   "eta": "Same day"},
    {"code": "EG", "name": "Egypt",         "flag": "🇪🇬", "currency": "USD", "dial": "+20", "methods": ["Bank transfer", "Mobile wallet"],                  "eta": "Same day"},
    {"code": "NG", "name": "Nigeria",       "flag": "🇳🇬", "currency": "USD", "dial": "+234","methods": ["Bank transfer", "Mobile wallet"],                  "eta": "Same day"},
    {"code": "KE", "name": "Kenya",         "flag": "🇰🇪", "currency": "USD", "dial": "+254","methods": ["M-Pesa", "Bank transfer"],                         "eta": "Minutes"},
    {"code": "GH", "name": "Ghana",         "flag": "🇬🇭", "currency": "USD", "dial": "+233","methods": ["Mobile money", "Bank"],                            "eta": "Same day"},
    {"code": "ZA", "name": "South Africa",  "flag": "🇿🇦", "currency": "USD", "dial": "+27", "methods": ["Bank transfer"],                                   "eta": "Same day"},
    {"code": "MX", "name": "Mexico",        "flag": "🇲🇽", "currency": "USD", "dial": "+52", "methods": ["SPEI", "Bank transfer", "OXXO"],                   "eta": "Minutes"},
    {"code": "BR", "name": "Brazil",        "flag": "🇧🇷", "currency": "USD", "dial": "+55", "methods": ["PIX", "Bank transfer"],                            "eta": "Minutes"},
    {"code": "AR", "name": "Argentina",     "flag": "🇦🇷", "currency": "USD", "dial": "+54", "methods": ["Bank transfer"],                                   "eta": "1–2 days"},
    {"code": "CL", "name": "Chile",         "flag": "🇨🇱", "currency": "USD", "dial": "+56", "methods": ["Bank transfer"],                                   "eta": "Same day"},
    {"code": "CO", "name": "Colombia",      "flag": "🇨🇴", "currency": "USD", "dial": "+57", "methods": ["Bank transfer", "PSE"],                            "eta": "Same day"},
    {"code": "PE", "name": "Peru",          "flag": "🇵🇪", "currency": "USD", "dial": "+51", "methods": ["Bank transfer"],                                   "eta": "Same day"},
    {"code": "PL", "name": "Poland",        "flag": "🇵🇱", "currency": "EUR", "dial": "+48", "methods": ["BLIK", "SEPA", "Bank"],                            "eta": "Same day"},
    {"code": "SE", "name": "Sweden",        "flag": "🇸🇪", "currency": "EUR", "dial": "+46", "methods": ["Swish", "SEPA"],                                    "eta": "Same day"},
    {"code": "NO", "name": "Norway",        "flag": "🇳🇴", "currency": "EUR", "dial": "+47", "methods": ["Vipps", "Bank transfer"],                          "eta": "Same day"},
    {"code": "DK", "name": "Denmark",       "flag": "🇩🇰", "currency": "EUR", "dial": "+45", "methods": ["MobilePay", "SEPA"],                                "eta": "Same day"},
    {"code": "FI", "name": "Finland",       "flag": "🇫🇮", "currency": "EUR", "dial": "+358","methods": ["SEPA", "Bank"],                                    "eta": "Same day"},
    {"code": "PT", "name": "Portugal",      "flag": "🇵🇹", "currency": "EUR", "dial": "+351","methods": ["Multibanco", "SEPA"],                              "eta": "Same day"},
    {"code": "GR", "name": "Greece",        "flag": "🇬🇷", "currency": "EUR", "dial": "+30", "methods": ["SEPA"],                                            "eta": "Same day"},
    {"code": "AT", "name": "Austria",       "flag": "🇦🇹", "currency": "EUR", "dial": "+43", "methods": ["SEPA"],                                            "eta": "Same day"},
    {"code": "BE", "name": "Belgium",       "flag": "🇧🇪", "currency": "EUR", "dial": "+32", "methods": ["Bancontact", "SEPA"],                              "eta": "Same day"},
]
