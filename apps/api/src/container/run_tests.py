import sys
import pytest

if __name__ == "__main__":
    # Run all tests in the tests directory
    print("Running Container Tests...")
    ret = pytest.main(["-v", "/workspace/tests"])
    sys.exit(ret)
