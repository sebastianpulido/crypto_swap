#!/bin/bash

echo "🚀 Setting up 1inch Cross-chain Swap Extension Development Environment"

# Check if nvm is installed
if ! command -v nvm &> /dev/null; then
    echo "📦 Installing nvm (Node Version Manager)..."
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
    [ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"
fi

# Install and use Node.js LTS
echo "📦 Installing Node.js LTS..."
nvm install --lts
nvm use --lts

# Clean any existing node_modules
echo "🧹 Cleaning existing dependencies..."
rm -rf node_modules
rm -rf frontend/node_modules
rm -rf package-lock.json
rm -rf frontend/package-lock.json

# Install dependencies
echo "📦 Installing root dependencies..."
npm install

echo "📦 Installing frontend dependencies..."
cd frontend && npm install && cd ..

# Create .env file if it doesn't exist
if [ ! -f .env ]; then
    echo "📝 Creating .env file..."
    cp .env.example .env
fi

echo "✅ Development environment setup complete!"
echo ""
echo "Node.js version: $(node --version)"
echo "npm version: $(npm --version)"
echo ""
echo "Next steps:"
echo "1. Compile contracts: npm run build"
echo "2. Run tests: npm test"
echo "3. Start local blockchain: npx hardhat node"
echo "4. Deploy contracts: npm run deploy"
echo "5. Start backend: npm start"
echo "6. Start frontend: cd frontend && npm start"