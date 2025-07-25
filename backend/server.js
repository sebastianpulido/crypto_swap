const express = require('express');
const cors = require('cors');
const { ethers } = require('ethers');
const BitcoinAtomicSwap = require('../bitcoin/atomicSwap');
const AtomicSwapABI = require('../artifacts/contracts/AtomicSwap.sol/AtomicSwap.json');
const path = require('path');

// Load environment variables from the root directory
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Initialize services
const bitcoinSwap = new BitcoinAtomicSwap();
let ethProvider, ethContract;

// Initialize Ethereum connection
async function initializeEthereum() {
    try {
        console.log('🔗 Connecting to Ethereum RPC:', process.env.ETHEREUM_RPC_URL);
        
        if (!process.env.ETHEREUM_RPC_URL) {
            throw new Error('ETHEREUM_RPC_URL not found in environment variables');
        }
        
        ethProvider = new ethers.JsonRpcProvider(process.env.ETHEREUM_RPC_URL);
        
        // Test the connection with timeout
        const networkPromise = ethProvider.getNetwork();
        const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Connection timeout')), 5000)
        );
        
        await Promise.race([networkPromise, timeoutPromise]);
        console.log('✅ Ethereum RPC connection successful');
        
        const contractAddress = process.env.ATOMIC_SWAP_CONTRACT_ADDRESS;
        
        if (!contractAddress || contractAddress === 'your_contract_address_here') {
            console.log('⚠️  No valid contract address found. Contract features will be disabled.');
            console.log('   To enable contract features:');
            console.log('   1. Run: ./simple-deploy.sh');
            console.log('   2. Restart the backend');
            return;
        }
        
        ethContract = new ethers.Contract(contractAddress, AtomicSwapABI.abi, ethProvider);
        console.log('✅ Ethereum contract initialized:', contractAddress);
        
        // Test contract connection
        try {
            await ethContract.owner();
            console.log('✅ Contract connection verified');
        } catch (error) {
            console.log('⚠️  Contract exists but may not be deployed correctly:', error.message);
            ethContract = null; // Disable contract if it's not working
        }
        
    } catch (error) {
        console.error('❌ Failed to initialize Ethereum:', error.message);
        console.log('   API will still work for basic operations');
        console.log('   To fix: ensure Hardhat node is running on port 8545');
        ethProvider = null;
        ethContract = null;
    }
}

// In-memory storage for active swaps (use database in production)
const activeSwaps = new Map();

// API Routes

/**
 * Generate a new secret for atomic swap
 */
app.post('/api/generate-secret', (req, res) => {
    try {
        const { secret, hashedSecret } = bitcoinSwap.generateSecret();
        res.json({
            success: true,
            data: { 
                secret, 
                hashedSecret: '0x' + hashedSecret  // Add 0x prefix for ethers.js compatibility
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Initiate Ethereum to Bitcoin swap
 */
app.post('/api/swap/eth-to-btc/initiate', async (req, res) => {
    try {
        const {
            swapId,
            ethAmount,
            btcAmount,
            btcAddress,
            hashedSecret,
            timelock,
            ethTokenAddress
        } = req.body;

        // Validate inputs
        if (!swapId || !ethAmount || !btcAmount || !btcAddress || !hashedSecret || !timelock) {
            return res.status(400).json({
                success: false,
                error: 'Missing required parameters'
            });
        }

        // Store swap details
        activeSwaps.set(swapId, {
            type: 'eth-to-btc',
            ethAmount,
            btcAmount,
            btcAddress,
            hashedSecret,
            timelock,
            ethTokenAddress: ethTokenAddress || ethers.ZeroAddress,
            status: 'initiated',
            createdAt: Date.now()
        });

        res.json({
            success: true,
            data: {
                swapId,
                message: 'Swap initiated. Please fund the Ethereum contract.',
                nextStep: 'fund-ethereum-contract'
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Initiate Bitcoin to Ethereum swap
 */
app.post('/api/swap/btc-to-eth/initiate', async (req, res) => {
    try {
        const {
            swapId,
            btcAmount,
            ethAmount,
            ethAddress,
            hashedSecret,
            timelock,
            ethTokenAddress,
            btcSenderPubKey,
            btcRecipientPubKey
        } = req.body;

        // Create Bitcoin atomic swap script
        const script = bitcoinSwap.createAtomicSwapScript(
            hashedSecret,
            timelock,
            btcRecipientPubKey,
            btcSenderPubKey
        );

        const btcSwapAddress = bitcoinSwap.createP2SHAddress(script);

        // Store swap details
        activeSwaps.set(swapId, {
            type: 'btc-to-eth',
            btcAmount,
            ethAmount,
            ethAddress,
            hashedSecret,
            timelock,
            ethTokenAddress: ethTokenAddress || ethers.ZeroAddress,
            btcSwapAddress,
            btcScript: script.toString('hex'),
            btcSenderPubKey,
            btcRecipientPubKey,
            status: 'initiated',
            createdAt: Date.now()
        });

        res.json({
            success: true,
            data: {
                swapId,
                btcSwapAddress,
                message: 'Bitcoin swap address created. Please fund this address.',
                nextStep: 'fund-bitcoin-address'
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Get swap status
 */
app.get('/api/swap/:swapId/status', async (req, res) => {
    try {
        const { swapId } = req.params;
        const swap = activeSwaps.get(swapId);

        if (!swap) {
            return res.status(404).json({
                success: false,
                error: 'Swap not found'
            });
        }

        // Check Ethereum contract status if applicable
        let ethStatus = null;
        if (ethContract) {
            try {
                const ethSwap = await ethContract.getSwap(swapId);
                ethStatus = {
                    exists: true,
                    withdrawn: ethSwap.withdrawn,
                    refunded: ethSwap.refunded,
                    timelock: ethSwap.timelock.toString()
                };
            } catch (error) {
                ethStatus = { exists: false };
            }
        }

        res.json({
            success: true,
            data: {
                ...swap,
                ethStatus
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Complete swap by revealing secret
 */
app.post('/api/swap/:swapId/complete', async (req, res) => {
    try {
        const { swapId } = req.params;
        const { secret, txHash } = req.body;

        const swap = activeSwaps.get(swapId);
        if (!swap) {
            return res.status(404).json({
                success: false,
                error: 'Swap not found'
            });
        }

        // Verify secret
        const crypto = require('crypto');
        const computedHash = crypto.createHash('sha256').update(Buffer.from(secret, 'hex')).digest('hex');
        
        if (computedHash !== swap.hashedSecret) {
            return res.status(400).json({
                success: false,
                error: 'Invalid secret'
            });
        }

        // Update swap status
        swap.status = 'completed';
        swap.secret = secret;
        swap.completionTxHash = txHash;
        swap.completedAt = Date.now();

        activeSwaps.set(swapId, swap);

        res.json({
            success: true,
            data: {
                message: 'Swap completed successfully',
                secret,
                txHash
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Get all active swaps
 */
app.get('/api/swaps', (req, res) => {
    try {
        const swaps = Array.from(activeSwaps.entries()).map(([id, swap]) => ({
            id,
            ...swap
        }));

        res.json({
            success: true,
            data: swaps
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Start server
app.listen(PORT, async () => {
    console.log(`Server running on port ${PORT}`);
    await initializeEthereum();
});

module.exports = app;

/**
 * Check funding status for a swap
 */
app.post('/api/swap/:swapId/check-funding', async (req, res) => {
    try {
        const { swapId } = req.params;
        const swap = activeSwaps.get(swapId);

        if (!swap) {
            return res.status(404).json({
                success: false,
                error: 'Swap not found'
            });
        }

        let fundingStatus = {
            ethFunded: false,
            btcFunded: false,
            readyForWithdrawal: false,
            message: ''
        };

        // Check Ethereum funding (real check)
        if (ethContract && (swap.type === 'eth-to-btc' || swap.type === 'eth-to-doge')) {
            try {
                const ethSwap = await ethContract.getSwap(swapId);
                fundingStatus.ethFunded = ethSwap.amount > 0 && !ethSwap.withdrawn && !ethSwap.refunded;
            } catch (error) {
                fundingStatus.ethFunded = false;
            }
        }

        // Check Bitcoin funding (simulated for local development)
        if (swap.btcSwapAddress) {
            // In a real implementation, this would query Bitcoin blockchain
            // For demo purposes, we'll simulate based on time elapsed
            const timeElapsed = Date.now() - swap.createdAt;
            const simulatedFundingDelay = 30000; // 30 seconds
            
            // Simulate that Bitcoin gets "funded" after 30 seconds
            fundingStatus.btcFunded = timeElapsed > simulatedFundingDelay;
            
            if (!fundingStatus.btcFunded) {
                fundingStatus.message = `Bitcoin funding simulated. Will be "funded" in ${Math.max(0, Math.ceil((simulatedFundingDelay - timeElapsed) / 1000))} seconds.`;
            }
        }

        // Determine if ready for withdrawal
        if (swap.type === 'eth-to-btc') {
            fundingStatus.readyForWithdrawal = fundingStatus.ethFunded;
            if (fundingStatus.readyForWithdrawal) {
                fundingStatus.message = '✅ ETH is funded! You can withdraw by entering the secret.';
            } else {
                fundingStatus.message = '⏳ Waiting for ETH funding confirmation...';
            }
        } else if (swap.type === 'btc-to-eth') {
            fundingStatus.readyForWithdrawal = fundingStatus.btcFunded;
            if (fundingStatus.readyForWithdrawal) {
                fundingStatus.message = '✅ BTC is "funded" (simulated)! You can withdraw by entering the secret.';
            }
        }

        // Update swap with funding info
        swap.fundingStatus = fundingStatus;
        swap.lastFundingCheck = Date.now();
        activeSwaps.set(swapId, swap);

        res.json({
            success: true,
            data: {
                swapId,
                fundingStatus,
                swapType: swap.type,
                btcSwapAddress: swap.btcSwapAddress,
                ethAmount: swap.ethAmount,
                btcAmount: swap.btcAmount
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Simulate Bitcoin funding (for demo purposes)
 */
app.post('/api/swap/:swapId/simulate-btc-funding', async (req, res) => {
    try {
        const { swapId } = req.params;
        const swap = activeSwaps.get(swapId);

        if (!swap) {
            return res.status(404).json({
                success: false,
                error: 'Swap not found'
            });
        }

        // Mark as funded
        if (!swap.fundingStatus) {
            swap.fundingStatus = {};
        }
        swap.fundingStatus.btcFunded = true;
        swap.fundingStatus.simulatedFunding = true;
        swap.fundingStatus.message = '✅ Bitcoin funding simulated successfully!';
        
        activeSwaps.set(swapId, swap);

        res.json({
            success: true,
            data: {
                message: 'Bitcoin funding simulated successfully',
                fundingStatus: swap.fundingStatus
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});