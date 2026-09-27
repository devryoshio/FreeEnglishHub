"""Odysee/LBRY playback helpers."""

from urllib.parse import urlparse, unquote, quote

import httpx

ODYSEE_PROXY_URL = "https://api.na-backend.odysee.com/api/v1/proxy"


def to_lbry_uri(video_url: str) -> str:
    """Convert an Odysee web URL to the LBRY URI expected by the SDK.

    Examples:
        https://odysee.com/@channel:abc/video:def -> lbry://@channel:abc/video:def
        https://odysee.com/video:def -> lbry://video:def
        lbry://@channel:abc/video:def -> unchanged
    """
    value = video_url.strip()

    if value.lower().startswith("lbry://"):
        return value.split("?", 1)[0].split("#", 1)[0]

    parsed = urlparse(value)
    if parsed.scheme not in {"http", "https"} or parsed.netloc.lower() not in {
        "odysee.com",
        "www.odysee.com",
        "lbry.tv",
        "www.lbry.tv",
    }:
        raise ValueError("Expected an Odysee URL (https://odysee.com/...) or an lbry:// URI.")

    path = unquote(parsed.path).lstrip("/")
    if not path:
        raise ValueError("The Odysee URL does not contain a claim path.")

    # Odysee's web path is the LBRY URI path. Keep ':' claim IDs intact.
    return f"lbry://{path}"


def _proxy_call(method: str, params: dict) -> dict:
    payload = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": method,
        "params": params,
    }

    with httpx.Client(timeout=30.0) as client:
        response = client.post(
            f"{ODYSEE_PROXY_URL}?m={method}",
            json=payload,
            headers={"Content-Type": "application/json"},
        )
        response.raise_for_status()
        data = response.json()

    if data.get("error"):
        error = data["error"]
        message = error.get("message", str(error)) if isinstance(error, dict) else str(error)
        raise RuntimeError(message)

    result = data.get("result")
    if not isinstance(result, dict):
        raise RuntimeError(f"Odysee returned an invalid {method} response.")
    return result


def _extract_claim(payload: dict, lbry_uri: str) -> dict | None:
    """Handle the slightly different claim wrappers returned by SDK proxy versions."""
    if not isinstance(payload, dict):
        return None

    candidates = [
        payload.get(lbry_uri),
        payload.get("claim"),
        payload.get("result"),
        payload,
    ]

    for candidate in candidates:
        if isinstance(candidate, dict):
            if candidate.get("claim_id") or candidate.get("claimId") or candidate.get("value") or candidate.get("streaming_url"):
                return candidate
            # Some responses nest the claim under a single URL key.
            for value in candidate.values():
                if isinstance(value, dict) and (value.get("claim_id") or value.get("claimId") or value.get("streaming_url")):
                    return value
    return None


def _claim_id(claim: dict) -> str | None:
    return claim.get("claim_id") or claim.get("claimId") or claim.get("claim_id_hex")


def _claim_name(claim: dict, lbry_uri: str) -> str:
    # Prefer the SDK name. Otherwise derive the final path component from the URI.
    name = claim.get("name")
    if isinstance(name, str) and name:
        return name
    path = lbry_uri.removeprefix("lbry://")
    return path.rsplit("/", 1)[-1].split(":", 1)[0]


def resolve_stream_url(video_url: str) -> str:
    """Resolve an Odysee URL to the CDN streaming URL used by the player.

    The official Odysee clients use the SDK `get` method for playback. We keep a
    direct player.odycdn.com fallback because proxy response wrappers have changed
    over time.
    """
    lbry_uri = to_lbry_uri(video_url)

    resolved = _proxy_call("resolve", {"urls": [lbry_uri]})
    claim = _extract_claim(resolved, lbry_uri)

    if not claim:
        raise RuntimeError(f"couldn't find claim for {lbry_uri}")

    if claim.get("error"):
        raise RuntimeError(str(claim["error"]))

    # Preferred path: exactly what the current Odysee clients use.
    try:
        result = _proxy_call(
            "get",
            {
                "uri": lbry_uri,
                "save_file": False,
            },
        )
        claim_result = _extract_claim(result, lbry_uri) or result
        if isinstance(claim_result, dict) and claim_result.get("error"):
            raise RuntimeError(str(claim_result["error"]))
        streaming_url = claim_result.get("streaming_url") if isinstance(claim_result, dict) else None
        if streaming_url:
            return streaming_url
    except Exception:
        # Try the public playback CDN below. This also makes the integration
        # resilient to changes in the proxy response envelope.
        pass

    claim_id = _claim_id(claim)
    if claim_id:
        name = _claim_name(claim, lbry_uri)
        fallback = f"https://player.odycdn.com/api/v3/streams/free/{quote(name, safe='')}/{claim_id}"
        return fallback

    raise RuntimeError(f"Odysee resolved the claim but did not return a playback URL for {lbry_uri}.")

