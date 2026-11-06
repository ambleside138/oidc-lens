"""Exercise the running Compose stack over HTTPS without saving cookies or tokens."""

import argparse
import http.cookiejar
import json
import socket
import ssl
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


def request(opener, url, expected, fields=None):
    data = None if fields is None else urllib.parse.urlencode(fields).encode()
    try:
        response = opener.open(url, data=data, timeout=15)
    except urllib.error.HTTPError as error:
        response = error
    with response:
        if response.code != expected:
            path = urllib.parse.urlsplit(url).path
            raise AssertionError(f"{path}: expected HTTP {expected}, got {response.code}")
        return response.headers, response.read()


def verify_login():
    opener = browser()
    request(opener, f"{APP}/api/session", 401)
    headers, _ = request(opener, f"{APP}/auth/login", 302)
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
    _, session = request(opener, f"{APP}/api/session", 200)
    assert json.loads(session) == {"authenticated": True}
    attempt = urllib.parse.parse_qs(urllib.parse.urlsplit(headers["Location"]).query)["attempt"][0]
    _, data = request(opener, f"{APP}/api/attempts/{attempt}", 200)
    steps = json.loads(data)["steps"]
    assert [step["id"] for step in steps] == [
        "authorization-request", "callback", "code-exchange", "token-http", "session"
    ]
    assert steps[3]["status"] == 200
    assert steps[3]["response"]["id_token"] == "present"
    assert callback.fields["code"].encode() not in data
    assert callback.fields["state"].encode() not in data
    print("Keycloak enforced S256, established a BFF session and produced a masked trace.")
    return steps


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--record", type=Path, help="write only the masked trace steps as JSON")
    args = parser.parse_args()
    getaddrinfo = socket.getaddrinfo

    def resolve_local(host, *args, **kwargs):
        # Browsers resolve .localhost to loopback. Reproduce that on every test host.
        return getaddrinfo("127.0.0.1" if host.endswith(".localhost") else host, *args, **kwargs)

    with patch("socket.getaddrinfo", resolve_local):
        steps = verify_login()
    if args.record:
        args.record.parent.mkdir(parents=True, exist_ok=True)
        args.record.write_text(json.dumps(steps, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
