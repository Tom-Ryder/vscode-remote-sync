#!/bin/bash

echo "VS Code Remote Sync Demo"
echo "========================"
echo ""

DEMO_DIR="$HOME/demo-remote-sync"
rm -rf "$DEMO_DIR"
mkdir -p "$DEMO_DIR/local"
mkdir -p "$DEMO_DIR/remote"

cd "$DEMO_DIR/local"

cat > main.py << 'EOF'
#!/usr/bin/env python3

def greet(name: str) -> str:
    return f"Hello, {name}! Welcome to Remote Sync."

def main() -> None:
    message = greet("Developer")
    print(message)
    print("Edit this file and save to see it sync!")

if __name__ == "__main__":
    main()
EOF

cat > config.yaml << 'EOF'
app:
  name: "Remote Sync Demo"
  version: "1.0.0"
  features:
    - "Automatic sync on save"
    - "Pattern matching"
    - "Debouncing"
    - "Error recovery"
EOF

cat > data.json << 'EOF'
{
  "users": [
    {"id": 1, "name": "Alice"},
    {"id": 2, "name": "Bob"}
  ],
  "timestamp": "2024-01-01T00:00:00Z"
}
EOF

cat > .gitignore << 'EOF'
__pycache__/
*.pyc
*.log
*.tmp
.vscode/
.DS_Store
node_modules/
EOF

echo "Demo created at: $DEMO_DIR"
echo ""
echo "Test Instructions:"
echo "1. code /Users/tryder/Documents/vscode_rsync"
echo "2. Press F5"
echo "3. Open folder: $DEMO_DIR/local"
echo "4. Save any file"
echo "5. Configure: localhost and $DEMO_DIR/remote"
echo ""
echo "Verify: ls -la $DEMO_DIR/remote/"