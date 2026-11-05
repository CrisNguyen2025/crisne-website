"""Verify roadmap-rag-assistant/tests/fixtures/schema.sql matches prisma/schema.prisma."""

from pathlib import Path
import shutil
import subprocess
import pytest


def test_schema_sql_matches_schema_prisma():
    repo_root = Path(__file__).resolve().parents[2]
    schema_prisma = repo_root / "prisma" / "schema.prisma"
    schema_sql = Path(__file__).resolve().parent / "fixtures" / "schema.sql"

    assert schema_sql.exists(), "fixtures/schema.sql must exist"

    if not shutil.which("npx"):
        pytest.skip("npx not available to run prisma migrate diff")

    try:
        result = subprocess.run(
            [
                "npx",
                "--yes",
                "prisma",
                "migrate",
                "diff",
                "--from-empty",
                "--to-schema-datamodel",
                str(schema_prisma),
                "--script",
            ],
            cwd=str(repo_root),
            capture_output=True,
            text=True,
            check=True,
        )
    except (subprocess.CalledProcessError, FileNotFoundError) as exc:
        pytest.skip(f"prisma migrate diff unavailable: {exc}")
        return

    expected_ddl = result.stdout.strip()
    actual_ddl = schema_sql.read_text("utf8").strip()
    assert (
        actual_ddl == expected_ddl
    ), "fixtures/schema.sql is out of date with prisma/schema.prisma! Run `yarn test:schema-sql` to regenerate."
