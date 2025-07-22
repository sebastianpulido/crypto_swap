#!/bin/bash

echo "🔄 Restarting all services for Atomic Swap Application..."
echo "=================================================="

# Function to kill processes on a specific port
kill_port() {
    local port=$1
    echo "🔍 Checking for processes on port $port..."
    
    if lsof -ti:$port > /dev/null 2>&1; then
        echo "⚠️  Killing processes on port $port..."
        lsof -ti:$port | xargs kill -9 2>/dev/null || true
        sleep 2
        echo "✅ Port $port cleared"
    else
        echo "✅ Port $port is already free"
    fi
}

# Step 1: Kill existing processes
echo ""
echo "📋 Step 1: Cleaning up existing processes..."
kill_port 3000  # Frontend
kill_port 3001  # Backend
kill_port 8545  # Hardhat (if running)

# Step 2: Start Hardhat Node
echo ""
echo "📋 Step 2: Starting Hardhat node..."
echo "🚀 Starting Hardhat node on port 8545..."

# Start Hardhat node with explicit host binding for MetaMask compatibility
npx hardhat node --hostname 0.0.0.0 > hardhat.log 2>&1 &
HARDHAT_PID=$!

# Wait for Hardhat node to be ready
echo "⏳ Waiting for Hardhat node to be ready..."
sleep 8

# Check if Hardhat node is running
if lsof -ti:8545 > /dev/null 2>&1; then
    echo "✅ Hardhat node is running successfully on port 8545"
else
    echo "❌ Hardhat node failed to start"
    echo "📄 Hardhat log:"
    tail -10 hardhat.log
    exit 1
fi

# Step 3: Start Backend
echo ""
echo "📋 Step 3: Starting backend server..."
echo "🚀 Starting backend on port 3001..."

# Start backend in background
cd backend
node server.js &
BACKEND_PID=$!
cd ..

# Wait a moment for backend to start
sleep 5

# Check if backend is running
if curl -s http://localhost:3001/health > /dev/null 2>&1; then
    echo "✅ Backend server is running successfully on port 3001"
else
    echo "❌ Backend server failed to start"
    exit 1
fi

# Step 4: Start Frontend
echo ""
echo "📋 Step 4: Starting frontend with proxy configuration..."
echo "🚀 Starting frontend on port 3000..."

# Start frontend in background
cd frontend
npm start &
FRONTEND_PID=$!
cd ..

# Wait for frontend to start
echo "⏳ Waiting for frontend to start (this may take a moment)..."
sleep 10

# Check if frontend is running
if lsof -ti:3000 > /dev/null 2>&1; then
    echo "✅ Frontend server is running successfully on port 3000"
else
    echo "❌ Frontend server failed to start"
    exit 1
fi

echo ""
echo "🎉 All services started successfully!"
echo "=================================================="
echo "🔗 Hardhat Node: http://localhost:8545"
echo "🔧 Backend API: http://localhost:3001"
echo "📱 Frontend: http://localhost:3000"
echo "🔍 Backend Health: http://localhost:3001/health"
echo ""
echo "💡 The frontend now has proxy configuration to forward API calls to the backend."
echo "💡 This should resolve the 'Unexpected token' error you were experiencing."
echo ""
echo "🔧 Process IDs:"
echo "   Hardhat PID: $HARDHAT_PID"
echo "   Backend PID: $BACKEND_PID"
echo "   Frontend PID: $FRONTEND_PID"
echo ""
echo "To stop services later, run:"
echo "   kill $HARDHAT_PID $BACKEND_PID $FRONTEND_PID"
echo "   or use: lsof -ti:8545,3001,3000 | xargs kill"
