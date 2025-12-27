import pytest
import importlib

def test_imports():
    """Verify critical dependencies are installed."""
    assert importlib.util.find_spec("pandas") is not None
    assert importlib.util.find_spec("pyarrow") is not None
    assert importlib.util.find_spec("pydantic") is not None
    assert importlib.util.find_spec("httpx") is not None

def test_scripts_package():
    """Verify scripts package is accessible."""
    assert importlib.util.find_spec("scripts") is not None

def test_permit_addenda_import():
    """Verify specific module imports."""
    mod = importlib.import_module("scripts.permit.addenda")
    assert hasattr(mod, "run")
    assert hasattr(mod, "InputSpec")
