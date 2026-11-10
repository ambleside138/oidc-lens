"""Exercise the staged client against real local Keycloak; never print credentials/tokens."""
import json
import socket
import subprocess
import urllib.error
import urllib.parse
import urllib.request
from unittest.mock import patch
from smoke_login import APP, ISSUER, Form, browser


def send(opener, url, payload=None, *, form=None, expect=(200,)):
    headers = {}
    data = None
    if payload is not None:
        data = json.dumps(payload).encode()
        headers = {"Content-Type": "application/json", "X-Oidc-Lens": "workshop"}
    elif form is not None:
        data = urllib.parse.urlencode(form).encode()
    try:
        response = opener.open(urllib.request.Request(url, data=data, headers=headers), timeout=20)
    except urllib.error.HTTPError as error:
        response = error
    with response:
        assert response.code in expect, f"{urllib.parse.urlsplit(url).path}: unexpected HTTP {response.code}"
        return response.code, response.headers, response.read()


def command(opener, id, name, payload=None):
    _, _, body = send(opener, f"{APP}/api/lab/{id}/{name}", payload or {})
    return json.loads(body)


def authenticate(opener, attempt):
    _, headers, _ = send(opener, f"{APP}/auth/lab/start?id={attempt['id']}", expect=(302,))
    authorization_url = headers["Location"]
    assert authorization_url.startswith(ISSUER + "/protocol/openid-connect/auth?")
    params = urllib.parse.parse_qs(urllib.parse.urlsplit(authorization_url).query)
    assert params["client_id"] == ["oidc-lens-lab"]
    assert params["code_challenge_method"] == ["S256"]
    assert params["response_mode"] == ["query"]
    _, _, page = send(opener, authorization_url)
    login = Form(page.decode(), "kc-form-login")
    assert login.action, "Expected real Keycloak login screen"
    login.fields.update(username="workshop", password="oidc-lens-demo")
    status, headers, page = send(opener, login.action, form=login.fields, expect=(200, 302))
    for _ in range(6):
        if status == 302:
            destination = urllib.parse.urlsplit(headers["Location"])
            if headers["Location"].startswith(APP + "/auth/lab/callback?"):
                break
            assert destination.netloc == urllib.parse.urlsplit(ISSUER).netloc and destination.path.startswith("/realms/demo/login-actions/")
            status, headers, page = send(opener, headers["Location"], expect=(200, 302))
        else:
            consent = Form(page.decode())
            assert consent.action and urllib.parse.urlsplit(consent.action).path == "/realms/demo/login-actions/consent", "Expected Keycloak permission screen"
            consent.fields["accept"] = "Yes"
            status, headers, page = send(opener, urllib.parse.urljoin(ISSUER, consent.action), form=consent.fields, expect=(200, 302))
    callback = headers["Location"]
    destination = urllib.parse.urlsplit(callback)
    assert callback.startswith(APP + "/auth/lab/callback?"), f"Unexpected destination: {destination.scheme}://{destination.netloc}{destination.path}; query fields={list(urllib.parse.parse_qs(destination.query))}"
    returned = urllib.parse.parse_qs(urllib.parse.urlsplit(callback).query)
    _, headers, _ = send(opener, callback, expect=(302,))
    assert headers["Location"] == "/#/lab/callback"
    _, _, state = send(opener, APP + "/api/lab")
    current = json.loads(state)["attempt"]
    assert current["phase"] == "code-received"
    assert all(log["stepId"] not in ("token", "validate", "session", "api") for log in current["logs"])
    return [returned["code"][0], params["state"][0], params["nonce"][0], params["code_challenge"][0]]


def run(pkce):
    opener = browser()
    _, _, body = send(opener, APP + "/api/lab", {})
    prepared = json.loads(body)
    assert prepared["phase"] == "prepared"
    id = prepared["id"]
    secrets = authenticate(opener, prepared)
    send(opener, APP + "/api/session", expect=(401,))
    send(opener, f"{APP}/api/lab/{id}/session", {}, expect=(409,))
    tokens = command(opener, id, "token", {"pkce": pkce})
    send(opener, f"{APP}/api/lab/{id}/token", {"pkce": pkce}, expect=(409,))
    if pkce == "wrong":
        assert tokens["phase"] == "failed"
        assert any(log["stepId"] == "token" and "400" in log["wire"] and "invalid_grant" in log["wire"] for log in tokens["logs"])
        send(opener, APP + "/api/session", expect=(401,))
        _, _, fresh = send(opener, APP + "/api/lab", {})
        assert "invalid_grant" in json.loads(fresh)["previousTokenResponse"]
        result = tokens
    else:
        assert tokens["phase"] == "tokens-received"
        assert all(log["stepId"] not in ("validate", "session", "api") for log in tokens["logs"])
        send(opener, APP + "/api/session", expect=(401,))
        validated = command(opener, id, "validate")
        assert validated["phase"] == "validated"
        send(opener, APP + "/api/session", expect=(401,))
        assert command(opener, id, "session")["phase"] == "session-established"
        send(opener, APP + "/api/session")
        result = command(opener, id, "resource")
        assert result["phase"] == "complete"
        assert result["resourceMessage"] == "Protected resource reached."
        assert any(log["from"] == "resource" and "200" in log["wire"] for log in result["logs"])
    safe = json.dumps(result).encode()
    logs = subprocess.run(["docker", "compose", "logs", "--no-color"], capture_output=True, check=True).stdout
    for secret in secrets + ["oidc-lens-demo"]:
        assert secret.encode() not in safe and secret.encode() not in logs, "Secret present in logs"
    print(f"{pkce}: actual Keycloak exchange, wait boundaries, replay guard and masked logs verified")


if __name__ == "__main__":
    original = socket.getaddrinfo
    def resolve(host, *args, **kwargs):
        return original("127.0.0.1" if host.endswith(".localhost") else host, *args, **kwargs)
    with patch("socket.getaddrinfo", resolve):
        run("correct")
        run("wrong")
