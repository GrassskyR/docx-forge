"""Execute model-authored document generation with Linux Landlock restrictions."""

import ctypes
import os
import platform
import resource
import runpy
import sysconfig
from pathlib import Path

CREATE_RULESET, ADD_RULE, RESTRICT_SELF = 444, 445, 446
RULE_PATH_BENEATH = 1
PR_SET_NO_NEW_PRIVS = 38
ABI_VERSION_QUERY = 1
READ_FILE = 1 << 2
READ_DIR = 1 << 3
WRITE_FILE = 1 << 1
REMOVE_FILE = 1 << 5
MAKE_REGULAR_FILE = 1 << 8
TRUNCATE = 1 << 14
ABI_3_FILESYSTEM_RIGHTS = (1 << 15) - 1


class Ruleset(ctypes.Structure):
    _fields_ = [("handled_access_fs", ctypes.c_uint64)]


class PathRule(ctypes.Structure):
    _pack_ = 1
    _fields_ = [("allowed_access", ctypes.c_uint64), ("parent_fd", ctypes.c_int32)]


def checked(result: int) -> int:
    if result < 0:
        error = ctypes.get_errno()
        raise OSError(error, os.strerror(error))
    return result


def restrict_filesystem() -> None:
    if platform.machine() not in ("x86_64", "aarch64"):
        raise RuntimeError("运行 Baseline 需要 x86-64 或 ARM64 Linux")
    libc = ctypes.CDLL(None, use_errno=True)
    abi = checked(libc.syscall(CREATE_RULESET, 0, 0, ABI_VERSION_QUERY))
    if abi < 3:
        raise RuntimeError("运行 Baseline 需要 Landlock ABI 3 或更新版本")
    access = Ruleset(ABI_3_FILESYSTEM_RIGHTS)
    ruleset = checked(libc.syscall(CREATE_RULESET, ctypes.byref(access), ctypes.sizeof(access), 0))
    read_only = READ_DIR | READ_FILE
    allowed = {
        Path(sysconfig.get_path("stdlib")): read_only,
        Path(sysconfig.get_path("platlib")): read_only,
        Path.cwd(): read_only | WRITE_FILE | REMOVE_FILE | MAKE_REGULAR_FILE | TRUNCATE,
    }
    try:
        for path, rights in allowed.items():
            descriptor = os.open(path, os.O_PATH | os.O_CLOEXEC)
            try:
                rule = PathRule(rights, descriptor)
                checked(libc.syscall(ADD_RULE, ruleset, RULE_PATH_BENEATH, ctypes.byref(rule), 0))
            finally:
                os.close(descriptor)
        checked(libc.prctl(PR_SET_NO_NEW_PRIVS, 1, 0, 0, 0))
        checked(libc.syscall(RESTRICT_SELF, ruleset, 0))
    finally:
        os.close(ruleset)


def main() -> None:
    # Load trusted native modules before applying the read allowlist.
    import docx
    from lxml import etree

    assert docx.Document and etree.Element
    resource.setrlimit(resource.RLIMIT_CPU, (30, 30))
    resource.setrlimit(resource.RLIMIT_FSIZE, (48 * 1024**2, 48 * 1024**2))
    restrict_filesystem()
    runpy.run_path("baseline.py", run_name="__main__")


if __name__ == "__main__":
    main()
