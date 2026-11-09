"""Exercise the running Compose stack over HTTPS without saving cookies or tokens."""

import argparse
import http.cookiejar
import json
import re
import socket
import ssl
import subprocess
import urllib.error
import urllib.parse
import urllib.request
from html.parser import HTMLParser
from pathlib import Path
from unittest.mock import patch

APP = "https://localhost:7443"
ISSUER = "https://keycloak.dev.localhost:8443/realms/demo"


class Form(HTMLParser):
    def __init__(self, html, form_id=None):
        super().__init__()
        self.form_id = form_id
        self.active = False
        self.action = None
        self.fields = {}
        self.feed(html)

    def handle_starttag(self, tag, attributes):
        attrs = dict(attributes)
        if tag == "form" and self.action is None:
            self.active = self.form_id is None or attrs.get("id") == self.form_id
            if self.active:
                self.action = attrs.get("action")
        if self.active and tag == "input" and attrs.get("type", "").lower() == "hidden":
            self.fields[attrs["name"]] = attrs.get("value", "")

    def handle_endtag(self, tag):
        if tag == "form":
            self.active = False


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def browser():
    cert = Path(__file__).resolve().parents[1] / ".https" / "local.crt"
    return urllib.request.build_opener(
        urllib.request.ProxyHandler({}),
        urllib.request.HTTPSHandler(context=ssl.create_default_context(cafile=str(cert))),
        urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()),
        NoRedirect(),
    )


def request(opener, url, expected, fields=None, headers=None):
    data = None if fields is None else urllib.parse.urlencode(fields).encode()
    req = urllib.request.Request(url, data=data, headers=headers or {})
    try:
        response = opener.open(req, timeout=15)
    except urllib.error.HTTPError as error:
        response = error
    with response:
        if response.code != expected:
            path = urllib.parse.urlsplit(url).path
            raise AssertionError(f"{path}: expected HTTP {expected}, got {response.code}")
        return response.headers, response.read()


def verify_frontend(opener):
    _, page = request(opener, f"{APP}/", 200)
    bundle = re.search(rb'src="(/assets/[^"]+\.js)"', page)
    assert bundle, "Expected the Vue bundle in the BFF home page."
    _, javascript = request(opener, APP + bundle[1].decode(), 200)
    return javascript


def verify_login():
    opener = browser()
    verify_frontend(opener)
    request(opener, f"{APP}/api/session", 401)
    headers, _ = request(opener, f"{APP}/my-data", 302)
    authorization = urllib.parse.urlsplit(headers["Location"])
    assert authorization.geturl().startswith(ISSUER + "/protocol/openid-connect/auth?")
    parameters = urllib.parse.parse_qs(authorization.query)
    assert parameters["response_type"] == ["code"]
    assert parameters["code_challenge_method"] == ["S256"]
    assert parameters["redirect_uri"] == [f"{APP}/signin-oidc"]
    assert "request_uri" not in parameters

    without_pkce = {key: value for key, value in parameters.items()
                    if key not in ("code_challenge", "code_challenge_method")}
    invalid_url = authorization._replace(query=urllib.parse.urlencode(without_pkce, doseq=True))
    _, rejection = request(browser(), invalid_url.geturl(), 200)
    assert Form(rejection.decode(), "kc-form-login").action is None
    assert "code_challenge" in rejection.decode()

    _, page = request(opener, authorization.geturl(), 200)
    login = Form(page.decode(), "kc-form-login")
    assert login.action and login.action.startswith(ISSUER + "/login-actions/")
    login.fields.update(username="workshop", password="oidc-lens-demo")
    _, page = request(opener, login.action, 200, login.fields)
    callback = Form(page.decode())
    assert callback.action == f"{APP}/signin-oidc"
    assert "code" in callback.fields and "state" in callback.fields, (
        f"Expected an authorization code, found form field names {sorted(callback.fields)}."
    )
    headers, _ = request(opener, callback.action, 302, callback.fields)
    assert headers["Location"] == "/my-data", "Authentication must return to the original resource."
    _, session = request(opener, f"{APP}/api/session", 200)
    assert json.loads(session) == {"authenticated": True}
    _, resource = request(opener, f"{APP}/my-data", 200)
    assert json.loads(resource) == {"reached": True, "message": "Protected resource reached."}
    _, attempts = request(opener, f"{APP}/api/attempts", 200)
    attempt = json.loads(attempts)[0]["id"]
    _, data = request(opener, f"{APP}/api/attempts/{attempt}", 200)
    steps = json.loads(data)["steps"]
    assert [step["id"] for step in steps] == [
        "resource-request", "authorization-request", "callback", "code-exchange", "token-http", "session",
        "api-browser", "api-resource"
    ]
    by_id = {step["id"]: step for step in steps}
    assert by_id["resource-request"]["url"] == by_id["api-browser"]["url"] == "/my-data"
    assert by_id["resource-request"]["request"]["Cookie"] == "absent"
    assert by_id["api-browser"]["request"]["Cookie"] == "present"
    assert by_id["api-browser"]["method"] == "GET" and by_id["api-browser"]["status"] == 200
    assert by_id["token-http"]["status"] == 200
    assert by_id["token-http"]["response"]["id_token"] == "present"
    assert by_id["session"]["idToken"]["result"] == "session-established"
    assert by_id["callback"]["response"]["Location"] == "/my-data"
    assert by_id["callback"]["response"]["Set-Cookie"] == "present"
    assert by_id["api-resource"]["status"] == 200
    # A second visit uses the application session instead of starting OIDC again.
    _, again = request(opener, f"{APP}/my-data", 200)
    assert json.loads(again) == json.loads(resource)
    _, later_attempts = request(opener, f"{APP}/api/attempts", 200)
    assert len(json.loads(later_attempts)) == len(json.loads(attempts))
    logs = subprocess.run(["docker", "compose", "logs", "--no-color"], capture_output=True, check=True).stdout
    for secret in (callback.fields["code"], callback.fields["state"], parameters["nonce"][0],
                   parameters["code_challenge"][0], "oidc-lens-demo", "oidc-lens-local-only"):
        assert secret.encode() not in data and secret.encode() not in logs, "Secret in history or Compose logs."
    print("GET /my-data triggered authentication, returned to /my-data with a session Cookie, and fetched API data.")
    print("Keycloak enforced S256; repeated GET /my-data reused the session and returned HTTP 200.")
    print("The masked trace and Compose logs did not contain the checked secret values.")
    return steps


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--record", type=Path, help="write only the masked trace steps as JSON")
    mode.add_argument("--replay-only", action="store_true", help="verify the bundled replay without contacting Keycloak")
    args = parser.parse_args()
    getaddrinfo = socket.getaddrinfo

    def resolve_local(host, *args, **kwargs):
        # Browsers resolve .localhost to loopback. Reproduce that on every test host.
        return getaddrinfo("127.0.0.1" if host.endswith(".localhost") else host, *args, **kwargs)

    with patch("socket.getaddrinfo", resolve_local):
        if args.replay_only:
            javascript = verify_frontend(browser())
            assert b"https://resource-api.dev.localhost:9443/protected" in javascript
            print("The BFF served the bundled recording through the protected API step.")
        else:
            steps = verify_login()
    if args.record:
        args.record.parent.mkdir(parents=True, exist_ok=True)
        args.record.write_text(json.dumps(steps, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
