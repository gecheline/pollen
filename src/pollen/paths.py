"""Where the app's own data lives — the vocab-map assets and the built
frontend. Two different answers depending on how pollen is running:

- Normal (pip-installed or source checkout): next to this file, inside the
  installed/checked-out `pollen` package directory — assets/ and web/ are
  siblings of this module.
- Frozen (PyInstaller .app bundle): PyInstaller collects bundled data under
  sys._MEIPASS at runtime, not next to wherever this file originally lived
  on the build machine. A bundled copy of this module doesn't know its own
  "directory" the normal way — __file__ still resolves to *something*
  inside the bundle, but nothing is guaranteed to sit next to it there.

Every module that needs assets/ or web/ routes through this one function
rather than resolving __file__ itself, so there's exactly one place that
knows about the distinction. Getting this wrong is the single most likely
way the packaged app builds fine, launches fine, and then 404s or can't
find models.json the moment it actually does something.
"""

from __future__ import annotations

import sys
from pathlib import Path


def resource_dir() -> Path:
    if getattr(sys, "frozen", False):
        return Path(sys._MEIPASS)  # type: ignore[attr-defined]
    return Path(__file__).resolve().parent
