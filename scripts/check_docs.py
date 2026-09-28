"""Check local Markdown file links and disallow tracked environment secrets."""

import re
import subprocess
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]


def main():
    errors = []
    markdown = [
        *ROOT.glob("*.md"),
        *ROOT.joinpath("docs").rglob("*.md"),
        *ROOT.joinpath("artifacts").rglob("*.md"),
    ]
    for path in markdown:
        for target in re.findall(r"(?<!!)\[[^\]]*\]\(([^)]+)\)", path.read_text()):
            target = target.split(' "')[0].strip("<>")
            if urlsplit(target).scheme or target.startswith("#"):
                continue
            dest = unquote(target.split("#")[0])
            if dest and not (path.parent / dest).exists():
                errors.append(f"{path.relative_to(ROOT)}: missing {dest}")
    tracked = subprocess.run(
        ["git", "ls-files"], cwd=ROOT, text=True, capture_output=True, check=True
    )
    for path in tracked.stdout.splitlines():
        if Path(path).name.startswith(".env") and Path(path).name != ".env.example":
            errors.append(f"Environment file tracked: {path}")
    if errors:
        raise SystemExit("\n".join(errors))
    print(f"Validated local links in {len(markdown)} Markdown files; no tracked environment files")


if __name__ == "__main__":
    main()
