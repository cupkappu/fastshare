#!/bin/bash

# FastShare Playwright Debug Script

echo "=== FastShare Playwright Debug ==="
echo ""

# Kill any existing servers
echo "Stopping existing servers..."
pkill -f "vite|node.*server" 2>/dev/null || true
sleep 1

# Start dev server in background
echo "Starting Vite dev server..."
npm run dev > /tmp/vite.log 2>&1 &
VITE_PID=$!
echo "Vite PID: $VITE_PID"

# Wait for server to be ready
echo "Waiting for server to be ready..."
sleep 3

# Check if server is running
if ! curl -s http://localhost:5173 > /dev/null; then
  echo "ERROR: Server failed to start. Check /tmp/vite.log"
  kill $VITE_PID 2>/dev/null
  exit 1
fi

echo "✓ Server is ready at http://localhost:5173"
echo ""

# Run Playwright tests in debug mode
echo "Running Playwright tests in debug mode..."
echo "Press Ctrl+C to stop"
echo ""

npx playwright test tests/e2e/basic.spec.ts --debug --project=chromium

TEST_EXIT=$?

# Cleanup
echo ""
echo "Cleaning up..."
kill $VITE_PID 2>/dev/null

echo "Done. Test exit code: $TEST_EXIT"
exit $TEST_EXIT
