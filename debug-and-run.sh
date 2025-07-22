#!/bin/bash

echo "🔍 Starting 1inch Cross-chain Swap Extension Debug & Run"

# Function to check if a command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check Node.js version
echo "📋 Checking Node.js environment..."
if command_exists node; then
    echo "✅ Node.js version: $(node --version)"
else
    echo "❌ Node.js not found. Please install Node.js first."
    exit 1
fi

if command_exists npm; then
    echo "✅ npm version: $(npm --version)"
else
    echo "❌ npm not found. Please install npm first."
    exit 1
fi

# Check if dependencies are installed
echo "📋 Checking dependencies..."
if [ ! -d "node_modules" ]; then
    echo "📦 Installing root dependencies..."
    npm install
fi

if [ ! -d "frontend/node_modules" ]; then
    echo "📦 Installing frontend dependencies..."
    cd frontend && npm install && cd ..
fi

# Compile contracts
echo "🔨 Compiling smart contracts..."
if npm run build; then
    echo "✅ Smart contracts compiled successfully"
else
    echo "❌ Smart contract compilation failed"
    echo "🔍 Checking for common issues..."
    
    # Check if OpenZeppelin contracts are installed
    if [ ! -d "node_modules/@openzeppelin" ]; then
        echo "📦 Installing missing OpenZeppelin contracts..."
        npm install @openzeppelin/contracts
        npm run build
    fi
fi

# Run tests
echo "🧪 Running smart contract tests..."
if npm test; then
    echo "✅ All tests passed"
else
    echo "⚠️ Some tests failed, but continuing..."
fi

# Check if .env file exists
if [ ! -f .env ]; then
    echo "📝 Creating .env file from template..."
    cp .env.example .env
fi

echo "🎯 Starting development servers..."
echo ""
echo "To run the full application:"
echo "1. Terminal 1: npx hardhat node"
echo "2. Terminal 2: npm run deploy"
echo "3. Terminal 3: npm start"
echo "4. Terminal 4: cd frontend && npm start"
echo ""
echo "Or use the all-in-one command: npm run dev"

# Ask user what they want to do
echo ""
echo "What would you like to do?"
echo "1. Start Hardhat node"
echo "2. Deploy contracts"
echo "3. Start backend server"
echo "4. Start frontend"
echo "5. Run all tests"
echo "6. Exit"

read -p "Enter your choice (1-6): " choice

case $choice in
    1)
        echo "🚀 Starting Hardhat node..."
        npx hardhat node
        ;;
    2)
        echo "🚀 Deploying contracts..."
        npm run deploy
        ;;
    3)
        echo "🚀 Starting backend server..."
        npm start
        ;;
    4)
        echo "🚀 Starting frontend..."
        cd frontend && npm start
        ;;
    5)
        echo "🧪 Running all tests..."
        npm run test:all
        ;;
    6)
        echo "👋 Goodbye!"
        exit 0
        ;;
    *)
        echo "❌ Invalid choice"
        exit 1
        ;;
esac