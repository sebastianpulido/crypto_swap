#!/bin/bash

echo "🚀 Deploying AtomicSwap contract and updating configuration..."

# Start Hardhat node in background if not running
if ! lsof -ti:8545 > /dev/null 2>&1; then
    echo "📡 Starting Hardhat node..."
    npx hardhat node &
    HARDHAT_PID=$!
    sleep 5
    echo "✅ Hardhat node started (PID: $HARDHAT_PID)"
else
    echo "✅ Hardhat node already running"
fi

# Deploy contract
echo "📋 Deploying contract..."
DEPLOY_OUTPUT=$(npx hardhat run scripts/deploy.js --network localhost 2>&1)
echo "$DEPLOY_OUTPUT"

# Extract contract address from output
CONTRACT_ADDRESS=$(echo "$DEPLOY_OUTPUT" | grep -o "0x[a-fA-F0-9]\{40\}" | head -1)

if [ -n "$CONTRACT_ADDRESS" ]; then
    echo "✅ Contract deployed at: $CONTRACT_ADDRESS"
    
    # Update .env file
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        sed -i '' "s/ATOMIC_SWAP_CONTRACT_ADDRESS=.*/ATOMIC_SWAP_CONTRACT_ADDRESS=$CONTRACT_ADDRESS/" .env
        sed -i '' "s/REACT_APP_CONTRACT_ADDRESS=.*/REACT_APP_CONTRACT_ADDRESS=$CONTRACT_ADDRESS/" .env
    else
        # Linux
        sed -i "s/ATOMIC_SWAP_CONTRACT_ADDRESS=.*/ATOMIC_SWAP_CONTRACT_ADDRESS=$CONTRACT_ADDRESS/" .env
        sed -i "s/REACT_APP_CONTRACT_ADDRESS=.*/REACT_APP_CONTRACT_ADDRESS=$CONTRACT_ADDRESS/" .env
    fi
    
    echo "✅ Updated .env file with new contract address"
    echo "🎉 Setup complete! You can now restart the backend."
else
    echo "❌ Failed to extract contract address from deployment output"
    exit 1
fi