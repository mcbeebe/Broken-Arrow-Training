"""Dependency-pin policy — both failure modes from the 2026-08-20 night,
held shut.

Vercel installs api/requirements.txt fresh on every build, so the pins
ARE the deployment. Two opposite mistakes each caused an outage within
hours of each other:

  FORWARD  an unpinned major shipped itself: anthropic 1.0.0 removed the
           ``temperature`` kwarg and every LLM surface went dark.
  BACKWARD a cap set below the deployed version silently DOWNGRADED:
           garminconnect <0.3.0 resolved 0.3.2 → 0.2.40, whose older
           garth cannot complete Garmin's current auth flow.

The KNOWN_GOOD table is the anchor for both directions: the version of
each dependency verified working in production. Every specifier must
ADMIT its known-good version (no accidental downgrades — checkable with
no install at all), and the INSTALLED version in CI must be at or above
it (no resolver surprises). Raising a floor past known-good deliberately
fails until the table is re-verified — that is the point.

When you upgrade a dependency for real: verify the new version against
its call sites, then update KNOWN_GOOD in the same commit.
"""

from pathlib import Path

import pytest
from packaging.requirements import Requirement
from packaging.version import Version

REQUIREMENTS = Path(__file__).resolve().parents[2] / "requirements.txt"

# Versions verified working in production (or, for anthropic, verified by
# signature inspection to accept every kwarg production sends).
KNOWN_GOOD: dict[str, str] = {
    # 0.3.2 dropped the garth dependency entirely (verified against its
    # published metadata) — the broken 0.2.x line is what pulled the garth
    # whose OAuth flow failed. Its remaining transitives (curl_cffi,
    # requests, ua-generator) are unpinned; a full lockfile is the real
    # answer to transitive drift and is a deliberate, separate decision.
    "garminconnect": "0.3.2",
    "anthropic": "0.125.0",    # create()/stream() both accept `temperature`
    "pywebpush": "2.4.0",
    "psycopg": "3.3.4",
}

# FLOORS of known-breaking lines: everything AT OR ABOVE this version is
# breaking until the call sites are migrated. A floor, not an exact
# version — the review of this file's first draft proved the exact-version
# form was escapable (raise the range to >=1.1,<2.0, bump KNOWN_GOOD in
# the same commit, and every guard went green while all of 1.x still
# lacks `temperature`). Remove an entry only in the commit that migrates.
KNOWN_BREAKING_FLOOR: dict[str, tuple[str, str]] = {
    "anthropic": ("1.0.0", "1.x removed `temperature` from messages.create()/stream(); "
                           "migrate to output_config.effort before raising the bound"),
}

# Data-only packages: calendar-versioned, no API surface to break.
UPPER_BOUND_EXEMPT = {"tzdata"}


def _requirements() -> list[Requirement]:
    reqs = []
    for line in REQUIREMENTS.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#"):
            reqs.append(Requirement(line))
    return reqs


def test_every_dependency_carries_an_upper_bound():
    """An unpinned dep is the anthropic outage waiting on a different
    package — the next upstream major ships itself to production."""
    for req in _requirements():
        if req.name in UPPER_BOUND_EXEMPT:
            continue
        ops = {spec.operator for spec in req.specifier}
        assert ops & {"<", "<=", "==", "~="}, f"{req.name} has no upper bound: {req}"


def test_every_dependency_has_a_known_good_anchor():
    """A new dependency enters with its verified version on record, or is
    explicitly exempted — never silently unanchored."""
    for req in _requirements():
        assert req.name in KNOWN_GOOD or req.name in UPPER_BOUND_EXEMPT, (
            f"{req.name} has no KNOWN_GOOD entry — record the version you "
            f"verified, or add it to UPPER_BOUND_EXEMPT with a reason"
        )


def test_specifiers_admit_the_known_good_version():
    """The garminconnect counter-lesson, checkable with no install: a cap
    below the production-verified version is a downgrade, and a downgrade
    is its own outage. (A floor raised ABOVE known-good also fails, until
    the table is re-verified in the same commit — deliberately.)"""
    for req in _requirements():
        good = KNOWN_GOOD.get(req.name)
        if good is None:
            continue
        assert req.specifier.contains(good, prereleases=False), (
            f"{req.name} specifier {req.specifier} no longer admits its "
            f"production-verified version {good} — this resolves to a "
            f"downgrade or an unverified jump"
        )


def _effective_ceiling(req: Requirement) -> tuple[Version, bool] | None:
    """The tightest recognizable upper bound: (version, inclusive).
    Only explicit operators are recognized — the house style. Anything
    exotic (`~=`, wildcards) returns None, which the caller treats as
    "no provable ceiling" and fails: red-on-uncertainty, by design."""
    best: tuple[Version, bool] | None = None
    for spec in req.specifier:
        if spec.operator == "<":
            cand = (Version(spec.version), False)
        elif spec.operator in ("<=", "=="):
            if "*" in spec.version:
                return None
            cand = (Version(spec.version), True)
        else:
            continue
        if best is None or cand[0] < best[0]:
            best = cand
    return best


def test_specifiers_stay_below_known_breaking_floors():
    """The forward direction, closed for the whole breaking LINE: the
    pin's provable ceiling must sit at or below the floor of the known
    breakage — no widening, no floor-hopping past it."""
    for req in _requirements():
        breaking = KNOWN_BREAKING_FLOOR.get(req.name)
        if breaking is None:
            continue
        floor_str, why = breaking
        floor = Version(floor_str)
        ceiling = _effective_ceiling(req)
        assert ceiling is not None, (
            f"{req.name} needs an explicit `<` bound below {floor_str}: {why}"
        )
        top, inclusive = ceiling
        admits_breaking = top > floor or (top == floor and inclusive)
        assert not admits_breaking, (
            f"{req.name} specifier {req.specifier} reaches {top} "
            f"({'inclusive' if inclusive else 'exclusive'}), at or past the "
            f"known-breaking floor {floor_str}: {why}"
        )


def test_installed_versions_match_the_pins():
    """The runtime half: in CI (which installs requirements-dev, i.e. the
    full production set) the resolver's actual choice must satisfy the
    specifier AND sit at or above known-good. Catches a yanked release or
    resolver surprise that the static checks cannot see. Skips per-package
    in environments that don't have the production deps installed."""
    import os
    from importlib.metadata import PackageNotFoundError, version as installed_version

    in_ci = os.environ.get("CI", "").lower() == "true"
    checked = 0
    for req in _requirements():
        good = KNOWN_GOOD.get(req.name)
        if good is None:
            continue
        try:
            installed = installed_version(req.name)
        except PackageNotFoundError:
            if in_ci:
                # The review caught this as a false-green path: a partial
                # install (say, requirements-dev losing its `-r
                # requirements.txt` line) would silently verify only what
                # happened to be present. In CI, every production package
                # must be there to be checked — absence IS the finding.
                pytest.fail(
                    f"{req.name} is not installed in CI — the install step "
                    f"no longer covers the full production set, so this "
                    f"pin went unverified"
                )
            continue  # local envs may be partial; CI may not
        checked += 1
        assert req.specifier.contains(installed, prereleases=True), (
            f"installed {req.name} {installed} violates its own pin {req.specifier}"
        )
        assert Version(installed) >= Version(good), (
            f"installed {req.name} {installed} is OLDER than the "
            f"production-verified {good} — a downgrade reached the build"
        )
    if checked == 0:
        pytest.skip("no production dependencies installed in this environment")
