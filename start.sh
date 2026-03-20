#!/bin/bash

# FastShare Auto-Start Script
# Automatically finds available ports and starts all services

echo "=== FastShare Auto-Start ==="
echo ""

# Find available port
find_available_port() {
  local port=$1
  while lsof -i :$port >/dev/null 2>&1; do
    port=$((port + 1))
  done
  echo $port
}

# Find available signaling port
SIGNALING_PORT=$(find_available_port 8080)
echo "✓ Using signaling port: $SIGNALING_PORT"

# Kill existing processes
echo "Stopping existing processes..."
pkill -f "fastshare.*server" 2>/dev/null
pkill -f "fastshare.*vite" 2>/dev/null
sleep 1

# Start signaling server
echo "Starting signaling server on port $SIGNALING_PORT..."
cd "$(dirname "$0")"
PORT=$SIGNALING_PORT npm run server > /tmp/fastshare-server.log 2>&1 &
SERVER_PID=$!
echo "✓ Server PID: $SERVER_PID"

# Wait for server to start
sleep 2

# Check if server started successfully
if ps -p $SERVER_PID > /dev/null; then
  echo "✓ Signaling server started"
else
  echo "✗ Failed to start signaling server"
  cat /tmp/fastshare-server.log
  exit 1
fi

# Start Vite dev server
echo "Starting Vite dev server..."
npm run dev > /tmp/fastshare-vite.log 2>&1 &
VITE_PID=$!
echo "✓ Vite PID: $VITE_PID"

# Wait for Vite to start
sleep 3

# Check if Vite started successfully
if ps -p $VITE_PID > /dev/null; then
  echo "✓ Vite dev server started"
else
  echo "✗ Failed to start Vite dev server"
  cat /tmp/fastshare-vite.log
  exit 1
fi

echo ""
echo "=== FastShare Started Successfully ==="
echo ""
echo "Frontend: http://localhost:5173"
echo "Signaling: ws://localhost:$SIGNALING_PORT/signal"
echo ""
echo "Test connection: http://localhost:5173/test-ws.html"
echo ""
echo "To stop: kill $SERVER_PID $VITE_PID"
echo "Or run: pkill -f 'fastshare.*server|fastshare.*vite'"
echo ""

# Save PIDs for later
echo "$SERVER_PID" > /tmp/fastshare-server.pid
echo "$VITE_PID" > /tmp/fastshare-vite.pid
