#!/usr/bin/env python3
import json
import sys
import urllib.error
import urllib.request
from dataclasses import dataclass, asdict

BASE_URL = "http://localhost:8080/api/v1"
REQUEST_ID_HEADER = "X-Request-Id"


@dataclass
class CaseResult:
    name: str
    passed: bool
    detail: str


results: list[CaseResult] = []


def add_result(name: str, passed: bool, detail: str) -> None:
    results.append(CaseResult(name=name, passed=passed, detail=detail))


def request_json(method: str, path: str, body: dict | None = None, headers: dict | None = None):
    req_headers = {"Content-Type": "application/json"}
    if headers:
        req_headers.update(headers)

    data = None
    if body is not None:
        data = json.dumps(body).encode("utf-8")

    req = urllib.request.Request(
        url=f"{BASE_URL}{path}",
        method=method,
        data=data,
        headers=req_headers,
    )

    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
            return resp.status, dict(resp.headers), payload
    except urllib.error.HTTPError as exc:
        payload = json.loads(exc.read().decode("utf-8")) if exc.fp else {}
        return exc.code, dict(exc.headers), payload


def main() -> int:
    request_id = "test-0.0.2-backend"

    status, headers, payload = request_json("GET", "/health", headers={REQUEST_ID_HEADER: request_id})
    add_result(
        "health response wrapper",
        status == 200 and payload.get("data", {}).get("status") == "ok",
        f"status={status}, data.status={payload.get('data', {}).get('status')}",
    )
    add_result(
        "requestId echo",
        payload.get("requestId") == request_id and headers.get(REQUEST_ID_HEADER) == request_id,
        f"body.requestId={payload.get('requestId')}, header={headers.get(REQUEST_ID_HEADER)}",
    )

    bad_tpl_body = {
        "name": "",
        "schemaVersion": "0.0.1",
        "steps": [],
        "otherStep": {"nodes": [], "edges": []},
    }
    status, _, payload = request_json("POST", "/templates", body=bad_tpl_body)
    add_result(
        "bad template create error code",
        status == 400 and payload.get("error", {}).get("code") == "TT-0400-001",
        f"status={status}, errorCode={payload.get('error', {}).get('code')}",
    )

    tpl_body = {
        "name": "v0.0.2-test-template",
        "description": "backend automation",
        "schemaVersion": "0.0.1",
        "steps": [
            {
                "id": "step-1",
                "type": "openUrl",
                "position": {"x": 10, "y": 10},
                "data": {"label": "open", "config": {"url": "https://example.com"}},
            }
        ],
        "otherStep": {"nodes": [], "edges": []},
    }
    status, _, payload = request_json("POST", "/templates", body=tpl_body)
    template_id = payload.get("data", {}).get("id")
    add_result(
        "template create",
        status == 201 and bool(template_id),
        f"status={status}, templateId={template_id}",
    )

    status, _, payload = request_json("GET", f"/templates/{template_id}")
    add_result(
        "template get",
        status == 200 and payload.get("data", {}).get("id") == template_id,
        f"status={status}, gotId={payload.get('data', {}).get('id')}",
    )

    start_run_body = {"templateId": template_id, "dryRun": True}
    status, _, payload = request_json("POST", "/runs", body=start_run_body, headers={REQUEST_ID_HEADER: request_id})
    data = payload.get("data") or {}
    run_obj = data.get("run") or {}
    run_id = run_obj.get("id")
    add_result(
        "run start",
        status == 200 and bool(run_id),
        f"status={status}, runId={run_id}, error={payload.get('error')}",
    )

    if run_id:
        status, _, payload = request_json("GET", f"/runs/{run_id}")
        run_status = (payload.get("data") or {}).get("status")
        add_result(
            "run status query",
            status == 200 and run_status in {"PENDING", "RUNNING", "SUCCEEDED"},
            f"status={status}, runStatus={run_status}",
        )
    else:
        add_result("run status query", False, "run start failed, skipped")

    status, _, payload = request_json("DELETE", f"/templates/{template_id}")
    add_result(
        "template delete",
        status == 200 and payload.get("data", {}).get("deleted") is True,
        f"status={status}, deleted={payload.get('data', {}).get('deleted')}",
    )

    status, _, payload = request_json("GET", f"/templates/{template_id}")
    add_result(
        "deleted template not found",
        status == 404 and payload.get("error", {}).get("code") == "TT-0404-001",
        f"status={status}, errorCode={payload.get('error', {}).get('code')}",
    )

    passed = sum(1 for r in results if r.passed)
    total = len(results)

    summary = {
        "passCount": passed,
        "total": total,
        "results": [asdict(r) for r in results],
    }
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0 if passed == total else 1


if __name__ == "__main__":
    sys.exit(main())
