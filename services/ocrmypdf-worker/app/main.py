import os
import re
import shlex
import subprocess
import tempfile
from pathlib import Path

from fastapi import FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.responses import JSONResponse, Response

app = FastAPI(title="OCRmyPDF Worker", version="0.1.0")

DEFAULT_MAX_UPLOAD_MB = 75
DEFAULT_TIMEOUT_SECONDS = 240
DEFAULT_OCRMYPDF_JOBS = 2


def get_env_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        value = int(raw)
        return value if value > 0 else default
    except ValueError:
        return default


def get_max_upload_bytes() -> int:
    mb = get_env_int("OCR_MAX_UPLOAD_MB", DEFAULT_MAX_UPLOAD_MB)
    return mb * 1024 * 1024


def get_timeout_seconds() -> int:
    return min(get_env_int("OCR_TIMEOUT_SECONDS", DEFAULT_TIMEOUT_SECONDS), 900)


def get_ocr_jobs() -> int:
    return min(get_env_int("OCR_OCRMYPDF_JOBS", DEFAULT_OCRMYPDF_JOBS), 8)


def normalize_language(language: str | None) -> str:
    if not language:
        return "eng"
    normalized = language.strip().lower()
    if not normalized:
        return "eng"
    if not re.fullmatch(r"[a-z+]+", normalized):
        return "eng"
    return normalized


def authorize(authorization: str | None, x_api_key: str | None) -> None:
    configured_key = os.getenv("OCR_WORKER_API_KEY")
    if not configured_key:
        return

    if x_api_key == configured_key:
        return

    if authorization and authorization.lower().startswith("bearer "):
        token = authorization.split(" ", 1)[1].strip()
        if token == configured_key:
            return

    raise HTTPException(status_code=401, detail="Unauthorized OCR request.")


def build_ocrmypdf_command(input_path: Path, output_path: Path, language: str) -> list[str]:
    command = [
        "ocrmypdf",
        "--skip-text",
        "--output-type",
        "pdf",
        "--rotate-pages",
        "--deskew",
        "--jobs",
        str(get_ocr_jobs()),
        "-l",
        language,
    ]

    extra_args = (os.getenv("OCRMYPDF_EXTRA_ARGS") or "").strip()
    if extra_args:
        command.extend(shlex.split(extra_args))

    command.extend([str(input_path), str(output_path)])
    return command


@app.get("/healthz")
def healthcheck() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/ocr")
async def ocr_pdf(
    file: UploadFile = File(...),
    language: str = Form("eng"),
    authorization: str | None = Header(default=None),
    x_api_key: str | None = Header(default=None),
) -> Response:
    authorize(authorization, x_api_key)

    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")

    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    max_upload_bytes = get_max_upload_bytes()
    if len(file_bytes) > max_upload_bytes:
        raise HTTPException(
            status_code=413,
            detail=f"Uploaded file exceeds OCR_MAX_UPLOAD_MB ({max_upload_bytes // (1024 * 1024)} MB).",
        )

    lang = normalize_language(language)
    timeout_seconds = get_timeout_seconds()

    with tempfile.TemporaryDirectory(prefix="ocr-worker-") as temp_dir:
        temp_path = Path(temp_dir)
        input_path = temp_path / "input.pdf"
        output_path = temp_path / "output.pdf"
        input_path.write_bytes(file_bytes)

        command = build_ocrmypdf_command(input_path, output_path, lang)

        try:
            result = subprocess.run(
                command,
                check=False,
                capture_output=True,
                text=True,
                timeout=timeout_seconds,
            )
        except subprocess.TimeoutExpired as exc:
            return JSONResponse(
                status_code=504,
                content={"error": f"OCR timed out after {timeout_seconds} seconds.", "detail": str(exc)},
            )

        if result.returncode != 0:
            stderr = (result.stderr or "").strip()
            stdout = (result.stdout or "").strip()
            detail = stderr if stderr else stdout
            return JSONResponse(
                status_code=502,
                content={
                    "error": "OCRmyPDF failed to process the document.",
                    "detail": detail[:2000],
                },
            )

        if not output_path.exists():
            return JSONResponse(
                status_code=502,
                content={"error": "OCRmyPDF completed without output."},
            )

        output_bytes = output_path.read_bytes()
        if not output_bytes:
            return JSONResponse(
                status_code=502,
                content={"error": "OCRmyPDF produced an empty file."},
            )

        return Response(
            content=output_bytes,
            media_type="application/pdf",
            headers={
                "Cache-Control": "no-store",
                "Content-Disposition": 'inline; filename="ocr-output.pdf"',
            },
        )
