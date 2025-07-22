#!/bin/bash

echo "🛑 Stopping all processes..."
# Kill any existing processes
pkill -f "hardhat node" 2>/dev/null || true
pkill -f "node.*server.js" 2>/dev/null || true
pkill -f "react-scripts" 2>/dev/null || true

# Kill processes on specific ports
lsof -ti:8545 | xargs kill -9 2>/dev/null || true
lsof -ti:3001 | xargs kill -9 2>/dev/null || true
lsof -ti:3000 | xargs kill -9 2>/dev/null || true

sleep 2

echo "🚀 Starting fresh Hardhat node..."
# Start Hardhat node in background
npx hardhat node > hardhat.log 2>&1 &
HARDHAT_PID=$!
echo "Hardhat node PID: $HARDHAT_PID"

# Wait for node to be ready
echo "⏳ Waiting for Hardhat node to be ready..."
sleep 8

# Check if node is running
if ! lsof -ti:8545 > /dev/null 2>&1; then
    echo "❌ Hardhat node failed to start"
    cat hardhat.log
    exit 1
fi

echo "✅ Hardhat node is running"

# Deploy without timeout (macOS compatible)
echo "📋 Deploying contract..."
npx hardhat run scripts/deploy.js --network localhost > deploy.log 2>&1 &
DEPLOY_PID=$!

# Wait for deployment with manual timeout
COUNTER=0
MAX_WAIT=30

while kill -0 $DEPLOY_PID 2>/dev/null && [ $COUNTER -lt $MAX_WAIT ]; do
    echo "⏳ Deploying... ($COUNTER/$MAX_WAIT seconds)"
    sleep 1
    COUNTER=$((COUNTER + 1))
done

# Check if deployment is still running
if kill -0 $DEPLOY_PID 2>/dev/null; then
    echo "❌ Deployment timed out, killing process..."
    kill -9 $DEPLOY_PID 2>/dev/null
    echo "Deployment output:"
    cat deploy.log
    exit 1
fi

# Wait for the process to finish and get exit code
wait $DEPLOY_PID
DEPLOY_EXIT_CODE=$?

if [ $DEPLOY_EXIT_CODE -ne 0 ]; then
    echo "❌ Deployment failed with exit code: $DEPLOY_EXIT_CODE"
    echo "Deployment output:"
    cat deploy.log
    exit 1
fi

echo "✅ Deployment completed successfully"
echo "Deployment output:"
cat deploy.log

# Extract contract address
CONTRACT_ADDRESS=$(grep -o "0x[a-fA-F0-9]\{40\}" deploy.log | head -1)

if [ -n "$CONTRACT_ADDRESS" ]; then
    echo "✅ Contract deployed at: $CONTRACT_ADDRESS"
    
    # Update .env file (macOS compatible)
    sed -i '' "s/ATOMIC_SWAP_CONTRACT_ADDRESS=.*/ATOMIC_SWAP_CONTRACT_ADDRESS=$CONTRACT_ADDRESS/" .env
    
    echo "✅ Updated .env file"
    echo "🎉 Deployment complete!"
    echo "📋 Contract Address: $CONTRACT_ADDRESS"
    
    # Show updated .env content
    echo "📄 Updated .env file:"
    grep "ATOMIC_SWAP_CONTRACT_ADDRESS" .env
else
    echo "❌ Could not extract contract address"
    echo "Full deployment output:"
    cat deploy.log
    exit 1
fi