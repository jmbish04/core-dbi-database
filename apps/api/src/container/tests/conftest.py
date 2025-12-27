import sys
from pathlib import Path

# Ensure workspace is in path
sys.path.append(str(Path(__file__).parent.parent))

def pytest_configure(config):
    config.addinivalue_line("markers", "integration: mark test as integration test")
